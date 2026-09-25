# Network, Timers, Account, and Deferred Scope

## Disconnects
First disconnect: pause affected timer up to 20 seconds; opponent sees Waiting; no reconnect -> forfeit.

Second disconnect: no timer pause.

Third disconnect: automatic forfeit.

Stats distinguish Concession and Forfeit. Abandoned/server-error outcomes remain separate.

## Inactivity
If a turn timer expires due to no input, next turn countdown runs 1.25x faster until input. Animations/server timing are not sped up.

Two turns with no input -> auto-concession.

## Choice timers
Mandatory timeout resolves to random legal server option. Standard choice duration TBD unless content/config specifies.

## Draft timer
Default 90 seconds, configurable.

## Future account architecture
Plan for landing page, sign in, join code, authentication, persistent stats, private games, Membership gating. Current product concept: free users do not receive persistent stats/private games until paid Membership. Do not let this block Runtime V1.

## Audio
Deferred unless Mel reopens it.
