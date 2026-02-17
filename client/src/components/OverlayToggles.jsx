import { useDashboard } from '../context/useDashboard';

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
        <span>BOS</span>
      </label>

      <label className="control control--toggle">
        <input
          type="checkbox"
          checked={state.overlays.fvg}
          onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', payload: 'fvg' })}
        />
        <span>FVG</span>
      </label>
    </>
  );
}

export default OverlayToggles;
