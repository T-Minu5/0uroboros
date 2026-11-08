import { useEffect, useState, type FormEvent } from 'react';
import { platform, type Session } from './platform';

/** Landing-only header control: sign in (magic link / native) or sign out. */
export function LandingSignIn() {
  const host = platform();
  const [session, setSession] = useState<Session | null>(() => host.auth.session());
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => host.auth.onChange(next => { setSession(next); if (next) setOpen(false); }), [host]);

  const requestLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setNote(null);
    try { setNote(await host.auth.requestMagicLink(email.trim())); }
    catch (error) { setNote(error instanceof Error ? error.message : 'Could not send the link.'); }
    finally { setBusy(false); }
  };

  const native = async () => {
    if (!host.auth.signInNative || busy) return;
    setBusy(true); setNote(null);
    try { await host.auth.signInNative(); }
    catch (error) { setNote(error instanceof Error ? error.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  };

  if (session) {
    return <div className='landing-auth'>
      <span className='landing-auth-name' title={session.account.email ?? undefined}>{session.account.name}</span>
      <button type='button' className='settings-toggle' onClick={() => void host.auth.signOut()}>Sign out</button>
    </div>;
  }

  return <div className='landing-auth settings-cluster'>
    <button type='button' className='settings-toggle' aria-haspopup='true' aria-expanded={open} onClick={() => setOpen(value => !value)}>Sign in</button>
    {open && <>
      <span className='settings-scrim' onClick={() => setOpen(false)}/>
      <div className='settings-popover landing-auth-popover' aria-label='Sign in'>
        {host.auth.signInNative && <button type='button' disabled={busy} onClick={() => void native()}>
          {busy ? 'Signing in…' : host.auth.methods[0] === 'steam' ? 'Sign in with Steam' : host.auth.methods[0] === 'apple' ? 'Sign in with Apple' : 'Sign in'}
        </button>}
        {host.auth.methods.includes('email') && <form className='landing-auth-form' onSubmit={requestLink}>
          <label className='online-field'><span>E-mail</span>
            <input type='email' value={email} placeholder='you@example.com' aria-label='E-mail for sign-in link' autoComplete='email' onChange={event => setEmail(event.target.value)} disabled={busy}/>
          </label>
          <button type='submit' disabled={!email.trim() || busy}>{busy ? 'Sending…' : 'E-mail me a sign-in link'}</button>
        </form>}
        {note && <p className='online-status' role='status'>{note}</p>}
      </div>
    </>}
  </div>;
}
