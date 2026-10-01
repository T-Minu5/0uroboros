# Boardgame.io Feasibility Spike Brief

## Goal
Determine whether boardgame.io should be adopted, adopted with an extension layer, or rejected before broad implementation.

## Required prototypes

### Spike A: Runtime simultaneous hidden deployment
- Two clients submit face-down deployments inside the same timed window.
- Opponent cannot inspect identities until authoritative reveal.
- Multiple cards may be submitted.
- Server deadline closes window.
- Ordered alternating reveal events follow canonical play order.

### Spike B: Draft race
- Shared pile with one remaining copy.
- Two clients submit nearly simultaneous purchase requests.
- Atomic first-confirmed transaction wins.
- Losing request spends no Crypto.
- Idempotency key protects duplicate delivery.
- Same-pile cooldown enforced.

### Spike C: Disconnect/reconnect
- First disconnect pauses affected timer up to 20 seconds.
- Reconnect resumes.
- Second disconnect does not pause.
- State remains authoritative.

### Spike D: Wave Collapse playback barrier
- Server resolves entire authoritative Collapse.
- Emits ordered event stream.
- Client plays a multi-second visual sequence.
- Draft does not become actionable until server-owned presentation barrier.
- Client acknowledgement cannot block the server indefinitely.

## Required ADR output
Choose:
- ADOPT
- ADOPT_WITH_EXTENSION_LAYER
- REJECT

Explain:
- exact fit/mismatch
- custom infrastructure required
- concurrency guarantees
- reconnect implications
- event/replay support
- testing complexity
- migration cost if wrong
