import { runLiveAstraDeliveryTurn } from '../src/delivery/liveOpenAIWorker';
import { loadDeliveryState } from '../src/delivery/state';

async function main() {
  const root = process.cwd();
  const state = loadDeliveryState(root);
  const turn = await runLiveAstraDeliveryTurn({
    root,
    state,
    objective: state.next_objective || 'wp-visual-pass',
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        spend: turn.spendUsd,
        specialists: turn.specialistsConsulted,
        requests: turn.invocation.request_count,
        input_tokens: turn.invocation.input_tokens,
        bar: turn.critique.passed_competitive_bar,
        vd: turn.critique.visual_direction,
        ux: turn.critique.ux_comprehension,
        deficiencies: turn.critique.deficiencies.slice(0, 3),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('TURN_FAIL');
  console.error(error);
  process.exit(2);
});
