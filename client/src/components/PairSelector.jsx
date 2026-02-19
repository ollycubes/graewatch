// Dropdown for selecting the active currency pair (e.g. EUR/USD).
// Available pairs come from context so this component never hardcodes the list.
import { useDashboard } from '../context/useDashboard';

function PairSelector() {
  const { state, dispatch, pairs } = useDashboard();

  return (
    <label className="control">
      <span>Pair</span>
      <select
        value={state.pair}
        onChange={(e) => dispatch({ type: 'SET_PAIR', payload: e.target.value })}
      >
        {pairs.map((pair) => (
          <option key={pair} value={pair}>
            {pair}
          </option>
        ))}
      </select>
    </label>
  );
}

export default PairSelector;
