// Checkbox toggles for showing/hiding overlays on the chart.
// Dispatches TOGGLE_OVERLAY to context — CandlestickChart reacts to the
// updated state and shows/hides the relevant primitive without re-fetching.
import { useDashboard } from '../context/useDashboard';
import content from '../content.json';

const { overlays: OL } = content;

function OverlayToggles() {
  const { state, dispatch } = useDashboard();

  return (
    <>
      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.bos}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'bos' })}
        />
        <span>{OL.bos}</span>
      </label>

      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.fvg}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'fvg' })}
        />
        <span>{OL.fvg}</span>
      </label>

      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.gann}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'gann' })}
        />
        <span>{OL.gann}</span>
      </label>

      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.orderblocks}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'orderblocks' })}
        />
        <span>{OL.ob}</span>
      </label>

      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.liquidity}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'liquidity' })}
        />
        <span>{OL.liq}</span>
      </label>

      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.wyckoff}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'wyckoff' })}
        />
        <span>{OL.wyckoff}</span>
      </label>
    </>
  );
}

export default OverlayToggles;
