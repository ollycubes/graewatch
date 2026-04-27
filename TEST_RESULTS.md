# Test Results

**Summary:** 256 total tests — 256 passed, 0 failed.

- Server (Python / pytest): 204 / 204 passed
- Client (JS / Vitest): 52 / 52 passed

---

## BOS (Break of Structure) Tests — `server/tests/test_bos.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_candles_returns_empty | Returns no events when given an empty candle list | Passed |
| test_too_few_candles_returns_empty | Returns no events when fewer than the minimum required candles | Passed |
| test_bullish_bos_detected | Detects a bullish break of structure above prior swing high | Passed |
| test_bullish_bos_timestamp_is_break_candle | Bullish BOS timestamp matches the candle that broke the swing | Passed |
| test_bearish_bos_detected | Detects a bearish break of structure below prior swing low | Passed |
| test_bearish_bos_timestamp_is_break_candle | Bearish BOS timestamp matches the breaking candle | Passed |
| test_flat_candles_produce_no_bos | No BOS produced when price action is flat | Passed |
| test_no_bos_when_break_candle_missing | No BOS when no candle exceeds the swing level | Passed |
| test_bos_event_fields | BOS event contains all expected fields (type, price, ts, etc.) | Passed |
| test_swing_reset_after_bos | Swing reference is reset after a confirmed BOS | Passed |

---

## FVG (Fair Value Gap) Tests — `server/tests/test_fvg.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_candles_returns_empty | Returns no events when given an empty candle list | Passed |
| test_too_few_candles_returns_empty | Returns no events when fewer than 3 candles are provided | Passed |
| test_bullish_fvg_detected | Detects a bullish FVG when there is a 3-candle gap up | Passed |
| test_bullish_fvg_zone_values | Bullish FVG zone uses the correct high/low boundaries | Passed |
| test_bullish_fvg_timestamp_is_impulse_candle | Bullish FVG timestamp aligns to the impulse candle | Passed |
| test_bearish_fvg_detected | Detects a bearish FVG when there is a 3-candle gap down | Passed |
| test_bearish_fvg_zone_values | Bearish FVG zone uses the correct high/low boundaries | Passed |
| test_bearish_fvg_timestamp_is_impulse_candle | Bearish FVG timestamp aligns to the impulse candle | Passed |
| test_flat_candles_produce_no_fvg | Flat price action produces no FVG | Passed |
| test_fvg_event_fields | FVG event contains all required fields | Passed |
| test_bullish_fvg_mitigated_when_price_enters_gap | Bullish FVG marked mitigated when price re-enters the gap | Passed |
| test_bullish_fvg_unmitigated_when_price_stays_above | Bullish FVG remains unmitigated while price stays above | Passed |
| test_bearish_fvg_mitigated_when_price_enters_gap | Bearish FVG marked mitigated when price re-enters the gap | Passed |

---

## Order Block Tests — `server/tests/test_orderblocks.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_candles_returns_empty | Returns no events when given an empty candle list | Passed |
| test_too_few_candles_returns_empty | Returns no events when fewer than the minimum required candles | Passed |
| test_bullish_ob_detected | Detects bullish order block before bullish impulse | Passed |
| test_bullish_ob_zone_open_to_high | Bullish OB zone spans candle open to high | Passed |
| test_bearish_ob_detected | Detects bearish order block before bearish impulse | Passed |
| test_bearish_ob_zone_low_to_open | Bearish OB zone spans candle low to open | Passed |
| test_ob_event_fields | OB event contains all expected fields | Passed |
| test_flat_candles_produce_no_ob | Flat price action produces no order block | Passed |
| test_bullish_ob_mitigated | Bullish OB is marked mitigated when price returns to it | Passed |
| test_bullish_ob_unmitigated | Bullish OB remains unmitigated when price stays away | Passed |
| test_find_last_bearish_candle | Finds the last bearish candle before an up move | Passed |
| test_find_last_bullish_candle | Finds the last bullish candle before a down move | Passed |
| test_find_opposing_candle_returns_none_if_none_found | Returns None when no opposing candle exists | Passed |
| test_find_mitigation_bullish_ob | Detects mitigation event for bullish OB | Passed |
| test_find_mitigation_bearish_ob | Detects mitigation event for bearish OB | Passed |
| test_find_mitigation_returns_none_when_unmitigated | Returns None when OB has not been mitigated | Passed |

---

## Liquidity Tests — `server/tests/test_liquidity.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_candles_returns_empty | Returns no events when given an empty candle list | Passed |
| test_too_few_candles_returns_empty | Returns no events when fewer than the minimum required candles | Passed |
| test_sweep_above_high_is_bearish | Sweep above prior high is classified bearish | Passed |
| test_sweep_above_high_price_is_swing_level | Sweep price equals the swept swing level | Passed |
| test_sweep_above_high_timestamp_is_sweep_candle | Sweep timestamp aligns to the sweeping candle | Passed |
| test_sweep_below_low_is_bullish | Sweep below prior low is classified bullish | Passed |
| test_sweep_below_low_price_is_swing_level | Sweep price equals the swept swing level | Passed |
| test_sweep_when_close_above_swept_high | Detects sweep when close is above the swept high | Passed |
| test_sweep_when_close_below_swept_low | Detects sweep when close is below the swept low | Passed |
| test_swept_level_removed_after_sweep | Swept level is removed from active levels | Passed |
| test_event_fields | Liquidity event contains all expected fields | Passed |
| test_pool_flag_on_equal_highs | Pool flag is set when equal highs form a liquidity pool | Passed |
| test_non_pool_sweep_has_pool_false | Non-pool sweeps have pool flag set to false | Passed |

---

## Wyckoff Tests — `server/tests/test_wyckoff.py`

| Test Name | Description | Status |
|---|---|---|
| test_returns_empty_when_not_enough_candles | Returns empty when candle count is below threshold | Passed |
| test_returns_empty_when_no_price_movement | Returns empty when price has no consolidation/movement | Passed |
| test_detects_spring_below_consolidation_range | Detects a Wyckoff spring below the range | Passed |
| test_detects_upthrust_above_consolidation_range | Detects a Wyckoff upthrust above the range | Passed |
| test_no_signal_when_range_is_not_broken_within_lookahead | No signal if range stays intact in the lookahead window | Passed |
| test_wick_below_support_without_reclose_inside_range_is_not_a_spring | Wick without reclose is not a valid spring | Passed |
| test_signal_carries_range_metadata | Signal includes the consolidation range metadata | Passed |

---

## Gann Tests — `server/tests/test_gann.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_candles_returns_empty | Returns no boxes when given an empty candle list | Passed |
| test_too_few_candles_returns_empty | Returns no boxes when fewer than the minimum required candles | Passed |
| test_flat_candles_produce_no_boxes | Flat candles produce no Gann boxes | Passed |
| test_bullish_box_detected | Detects a bullish Gann box | Passed |
| test_bullish_box_prices | Bullish box uses correct high/low prices | Passed |
| test_bullish_box_start_timestamp_is_swing_low | Bullish box starts at swing low timestamp | Passed |
| test_bullish_box_end_timestamp_is_swing_high | Bullish box ends at swing high timestamp | Passed |
| test_bearish_box_detected | Detects a bearish Gann box | Passed |
| test_bearish_box_prices | Bearish box uses correct high/low prices | Passed |
| test_bearish_box_start_timestamp_is_swing_high | Bearish box starts at swing high timestamp | Passed |
| test_gann_box_fields | Gann box contains all expected fields | Passed |
| test_multiple_boxes_detected | Detects multiple Gann boxes in the same series | Passed |
| test_boxes_ordered_by_time | Returned boxes are ordered chronologically | Passed |

---

## Confluence / Bias Tests — `server/tests/test_confluence.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_current_tf_returns_neutral_empty_result | Empty current timeframe yields neutral bias and no zones | Passed |
| test_bias_chain_contains_every_tf_that_has_candles | Bias chain reports every timeframe that has data | Passed |
| test_higher_tf_overlap_adds_tf_confluence_bonus | Higher TF overlap adds the TF confluence bonus | Passed |
| test_no_tf_bonus_when_higher_tf_zones_do_not_overlap | No TF bonus when higher TF zones do not overlap current zones | Passed |
| test_gann_bonus_applied_when_zone_sits_in_discount_half_bullish_bias | Applies Gann discount-half bonus on bullish bias | Passed |
| test_zones_only_collected_per_TF_DETECTORS_config | Zones are only collected per TF_DETECTORS configuration | Passed |

---

## Setup / Trade Plan Tests — `server/tests/test_setup.py`

| Test Name | Description | Status |
|---|---|---|
| test_determine_bias_agreement_between_htf_and_current_bos | Bias resolves when HTF and current BOS agree | Passed |
| test_determine_bias_disagreement_is_neutral | Disagreement between HTF and current BOS yields neutral bias | Passed |
| test_determine_bias_falls_back_to_current_bos_when_no_htf | Falls back to current BOS when no HTF signal | Passed |
| test_determine_bias_neutral_when_no_signals | Neutral when no signals are present | Passed |
| test_determine_bias_htf_only_uses_gann_to_veto | HTF-only path uses Gann to veto bias | Passed |
| test_detect_returns_invalid_when_candles_empty | Returns invalid setup when candle list is empty | Passed |
| test_detect_returns_invalid_when_bias_is_neutral | Returns invalid setup when bias is neutral | Passed |
| test_detect_returns_invalid_when_no_zones_match_bias | Returns invalid setup when no zones match bias | Passed |
| test_detect_returns_invalid_when_no_target_available | Returns invalid setup when no target is available | Passed |
| test_detect_builds_bullish_setup_with_valid_geometry | Builds a valid bullish setup with correct geometry | Passed |
| test_detect_builds_bearish_setup_with_valid_geometry | Builds a valid bearish setup with correct geometry | Passed |
| test_at_poi_flag_true_when_price_sits_in_entry_zone | at_poi flag is true when price sits inside entry zone | Passed |

---

## Zones Tests — `server/tests/test_zones.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_candles_returns_neutral_empty_result | Empty candles yields neutral bias and no zones | Passed |
| test_neutral_bias_returns_no_zones_even_when_candidates_exist | Returns no zones when bias is neutral, even with candidates | Passed |
| test_only_zones_matching_bias_are_included | Only zones matching the bias are included in output | Passed |
| test_mitigated_zones_are_dropped | Mitigated zones are excluded from results | Passed |
| test_context_reports_current_close_and_bias_source | Context payload reports current close and bias source | Passed |
| test_context_reports_htf_bos_source_when_htf_signals_present | Context reports HTF BOS as bias source when HTF signals exist | Passed |
| test_zones_are_sorted_by_score_desc_and_carry_breakdown | Zones are sorted by score desc and carry score breakdown | Passed |

---

## Zone Adapter Tests — `server/tests/test_zone_adapters.py`

| Test Name | Description | Status |
|---|---|---|
| test_fvg_to_zone_preserves_edges_and_sets_source | FVG-to-zone preserves edges and sets source field | Passed |
| test_fvg_to_zone_propagates_mitigation_timestamp | FVG-to-zone propagates mitigation timestamp | Passed |
| test_fvg_to_zone_defaults_end_timestamp_when_missing | FVG-to-zone provides default end timestamp when missing | Passed |
| test_ob_to_zone_sets_source_and_preserves_fields | OB-to-zone sets source and preserves fields | Passed |
| test_wyckoff_to_zone_expands_level_by_half_atr | Wyckoff-to-zone expands the level by half ATR | Passed |
| test_wyckoff_to_zone_with_zero_atr_collapses_to_level | Wyckoff-to-zone collapses to the level when ATR is zero | Passed |

---

## Zone Cluster Tests — `server/tests/test_zone_cluster.py`

| Test Name | Description | Status |
|---|---|---|
| test_empty_input_returns_empty_list | Empty input produces empty cluster list | Passed |
| test_single_zone_is_returned_unchanged | Single zone is returned unchanged | Passed |
| test_overlapping_zones_are_merged | Overlapping zones are merged into one cluster | Passed |
| test_cluster_bonus_added_per_extra_zone | Cluster bonus is added per additional zone | Passed |
| test_proximity_merges_non_overlapping_zones_within_one_atr | Non-overlapping zones within 1 ATR merge by proximity | Passed |
| test_far_apart_zones_stay_separate | Zones beyond proximity threshold remain separate | Passed |
| test_output_sorted_by_score_descending | Output is sorted by score descending | Passed |
| test_merged_cluster_inherits_highest_score_zones_base_metadata | Merged cluster inherits base metadata of highest-score zone | Passed |

---

## Zone Scoring Tests — `server/tests/test_zone_scoring.py`

| Test Name | Description | Status |
|---|---|---|
| test_type_base_scores_match_constants | Type base scores match the configured constants | Passed |
| test_unknown_source_type_gets_zero_type_score | Unknown source types receive a zero type score | Passed |
| test_proximity_is_max_when_price_sits_inside_zone | Proximity score is max when price sits inside the zone | Passed |
| test_proximity_is_zero_past_max_dist | Proximity score is zero past the max distance | Passed |
| test_proximity_decays_linearly_between_zero_and_max | Proximity decays linearly between zero and max distance | Passed |
| test_at_poi_bonus_when_close_inside_zone | At-POI bonus applied when close sits inside zone | Passed |
| test_at_poi_bonus_when_close_within_1_5_atr_of_edge | At-POI bonus applied when close is within 1.5 ATR of edge | Passed |
| test_at_poi_absent_when_price_far_from_zone | At-POI bonus absent when price is far from the zone | Passed |
| test_liq_bonus_applies_when_unswept_pool_matches_direction_and_is_close | Liquidity bonus applied for matching, close, unswept pool | Passed |
| test_liq_bonus_ignores_swept_pools | Liquidity bonus ignores swept pools | Passed |
| test_liq_bonus_ignores_opposite_direction_pools | Liquidity bonus ignores pools in the opposite direction | Passed |
| test_liq_bonus_requires_pool_within_1_atr_of_zone_edge | Liquidity bonus requires pool within 1 ATR of zone edge | Passed |
| test_total_score_equals_sum_of_breakdown_components | Total score equals the sum of breakdown components | Passed |

---

## Interval Utility Tests — `server/tests/test_intervals.py`

| Test Name | Description | Status |
|---|---|---|
| test_normalize_interval_maps_aliases | Aliases like "1d", "daily" normalize to the canonical key | Passed |
| test_normalize_interval_returns_none_for_empty | Returns None for empty input | Passed |
| test_normalize_interval_returns_none_for_unknown_alias | Returns None for unknown aliases | Passed |
| test_supported_intervals_matches_twelvedata_keys | Supported intervals match TwelveData keys | Passed |
| test_htf_map_chains_through_to_weekly | HTF chain progresses up through to weekly | Passed |
| test_normalize_timestamp_snaps_to_interval_start | Normalizing a timestamp snaps it to the interval start | Passed |
| test_normalize_timestamp_accepts_date_only_input | Accepts date-only input strings | Passed |
| test_normalize_timestamp_raises_on_unparseable_input | Raises on unparseable timestamp input | Passed |

---

## Precision Utility Tests — `server/tests/test_utils_precision.py`

| Test Name | Description | Status |
|---|---|---|
| test_to_decimal_handles_none_as_zero | Converts None to Decimal(0) | Passed |
| test_to_decimal_preserves_float_precision_via_string | Preserves float precision by routing through str() | Passed |
| test_to_decimal_accepts_string_and_int | Accepts string and int inputs | Passed |
| test_to_decimal_passes_existing_decimal_through | Passes existing Decimal through unchanged | Passed |
| test_convert_candles_to_decimal_converts_price_fields | Converts OHLC price fields to Decimal | Passed |
| test_convert_candles_to_decimal_does_not_mutate_input | Conversion does not mutate the input list | Passed |
| test_convert_to_float_converts_top_level_decimal | Converts top-level Decimal to float | Passed |
| test_convert_to_float_walks_lists_and_dicts | Walks nested lists and dicts when converting to float | Passed |
| test_convert_to_float_passes_non_decimal_scalars_through | Non-Decimal scalars pass through unchanged | Passed |

---

## Auth Utility Tests — `server/tests/test_utils_auth.py`

| Test Name | Description | Status |
|---|---|---|
| test_hash_password_is_not_plaintext | Password hash differs from plaintext | Passed |
| test_hash_password_produces_unique_salts | Hashing the same password yields unique salts | Passed |
| test_verify_password_accepts_correct_password | verify_password returns True for correct password | Passed |
| test_verify_password_rejects_wrong_password | verify_password returns False for wrong password | Passed |
| test_verify_password_rejects_empty_password_against_real_hash | Rejects empty password against a real hash | Passed |
| test_hash_and_verify_handles_unicode | Hashing and verification handle unicode characters | Passed |
| test_create_access_token_returns_decodable_jwt | Created access token is a decodable JWT | Passed |
| test_create_access_token_sets_future_expiry | Created access token has a future expiry | Passed |
| test_decode_access_token_rejects_tampered_token | Decoder rejects tokens with tampered payload | Passed |
| test_decode_access_token_rejects_expired_token | Decoder rejects expired tokens | Passed |
| test_decode_access_token_rejects_wrong_secret | Decoder rejects tokens signed with a different secret | Passed |

---

## Auth Route Tests — `server/tests/test_routes_auth.py`

| Test Name | Description | Status |
|---|---|---|
| test_register_creates_user_and_returns_token | Register creates user and returns auth token | Passed |
| test_register_rejects_short_password | Register rejects passwords below minimum length | Passed |
| test_register_rejects_invalid_email | Register rejects invalid email formats | Passed |
| test_register_rejects_duplicate_email | Register rejects already-registered emails | Passed |
| test_register_does_not_leak_password_hash | Register response does not include the password hash | Passed |
| test_login_succeeds_with_correct_credentials | Login succeeds with correct credentials | Passed |
| test_login_rejects_wrong_password | Login rejects wrong password | Passed |
| test_login_rejects_unknown_email | Login rejects unknown email | Passed |
| test_login_error_messages_do_not_leak_user_existence | Login error messages do not reveal whether user exists | Passed |
| test_me_requires_authentication | /me endpoint requires authentication | Passed |
| test_me_rejects_invalid_token | /me endpoint rejects invalid tokens | Passed |
| test_me_returns_profile_with_valid_token | /me returns the profile when token is valid | Passed |
| test_me_returns_404_when_user_deleted | /me returns 404 when the user has been deleted | Passed |

---

## Snapshot Route Tests — `server/tests/test_routes_snapshots.py`

| Test Name | Description | Status |
|---|---|---|
| test_all_endpoints_require_auth | All snapshot endpoints require authentication | Passed |
| test_save_snapshot_stores_user_id_and_returns_id | Save endpoint stores user id and returns snapshot id | Passed |
| test_list_only_returns_current_users_snapshots | List endpoint returns only the current user's snapshots | Passed |
| test_list_filters_by_pair | List endpoint filters by pair query param | Passed |
| test_list_sorted_by_saved_at_desc | List results are sorted by saved_at descending | Passed |
| test_patch_updates_note_and_outcome | Patch updates note and outcome fields | Passed |
| test_patch_rejects_invalid_object_id | Patch rejects invalid ObjectId | Passed |
| test_patch_rejects_empty_body | Patch rejects empty bodies | Passed |
| test_patch_cannot_modify_other_users_snapshot | Patch cannot modify another user's snapshot | Passed |
| test_delete_removes_own_snapshot | Delete removes the current user's own snapshot | Passed |
| test_delete_rejects_invalid_object_id | Delete rejects invalid ObjectId | Passed |
| test_delete_cannot_remove_other_users_snapshot | Delete cannot remove another user's snapshot | Passed |
| test_delete_returns_404_for_missing_snapshot | Delete returns 404 for a missing snapshot | Passed |

---

## ATR / Pool Utility Tests — `server/tests/test_liquidity.py` (helpers)

| Test Name | Description | Status |
|---|---|---|
| test_compute_atr_single_candle | Computes ATR correctly for a single candle | Passed |
| test_compute_atr_basic | Computes ATR correctly for a basic candle series | Passed |
| test_mark_pools_marks_close_swings | Marks swings that are close together as liquidity pools | Passed |
| test_mark_pools_does_not_mark_distant_swings | Does not mark distant swings as pools | Passed |
| test_mark_pools_zero_tolerance_does_nothing | Zero tolerance produces no pool markings | Passed |

---

## Client — Dashboard Store Tests — `client/src/context/dashboardStore.test.js`

| Test Name | Description | Status |
|---|---|---|
| initialState — starts on step 0 | Initial state begins at step 0 | Passed |
| initialState — has no completed steps | Initial state has no completed steps | Passed |
| initialState — has no active selection | Initial state has no active selection | Passed |
| initialState — has all overlays disabled | Initial state has all overlays disabled | Passed |
| initialState — has all checklist items unchecked | Initial state has all checklist items unchecked | Passed |
| SET_PAIR — updates the pair | SET_PAIR action updates the trading pair | Passed |
| SET_PAIR — does not mutate other state | SET_PAIR does not mutate unrelated state | Passed |
| SET_INTERVAL — updates the interval | SET_INTERVAL updates the active interval | Passed |
| TOGGLE_OVERLAY — toggles a false overlay to true | Toggles a disabled overlay on | Passed |
| TOGGLE_OVERLAY — toggles a true overlay back to false | Toggles an enabled overlay off | Passed |
| TOGGLE_OVERLAY — does not affect other overlays | Toggling one overlay leaves others unchanged | Passed |
| TOGGLE_CHECKLIST_ITEM — marks an unchecked item as checked | Marks an unchecked checklist item checked | Passed |
| TOGGLE_CHECKLIST_ITEM — unchecks a checked item | Unchecks a previously checked checklist item | Passed |
| TOGGLE_CHECKLIST_ITEM — does not affect other items | Toggling one item leaves other items unchanged | Passed |
| TOGGLE_CHECKLIST_ITEM — does not advance the step automatically | Checking items does not auto-advance the step | Passed |
| TOGGLE_CHECKLIST_ITEM — does not change the interval when checking an item | Checking items does not change the interval | Passed |
| TOGGLE_CHECKLIST_ITEM — does not change the overlays when checking an item | Checking items does not change overlays | Passed |
| ADVANCE_STEP — does not advance when required items are not checked | Cannot advance until required items are checked | Passed |
| ADVANCE_STEP — advances to step 1 when step 0 is complete | Advances to step 1 when step 0 is complete | Passed |
| ADVANCE_STEP — marks the previous step as completed | Marks the previous step as completed on advance | Passed |
| ADVANCE_STEP — does not duplicate completed steps | Advancing twice does not duplicate completed steps | Passed |
| ADVANCE_STEP — clamps at the last step | Advancing past the last step clamps to the last step | Passed |
| ADVANCE_STEP — switches interval to the next step interval | Advancing switches interval to the next step's interval | Passed |
| ADVANCE_STEP — accumulates overlays from completed and new step | Overlays accumulate across completed and new step | Passed |
| GO_TO_STEP — allows navigating to a completed step | Can navigate back to a completed step | Passed |
| GO_TO_STEP — allows staying on the current step | Can stay on the current step | Passed |
| GO_TO_STEP — does not allow jumping ahead to an incomplete step | Cannot jump ahead to incomplete steps | Passed |
| GO_TO_STEP — updates interval to the target step interval | Navigating updates interval to target step's interval | Passed |
| RESET_CHECKLIST — resets to step 0 | Reset returns to step 0 | Passed |
| RESET_CHECKLIST — clears completed steps | Reset clears completed steps list | Passed |
| RESET_CHECKLIST — unchecks all checklist items | Reset unchecks all checklist items | Passed |
| RESET_CHECKLIST — clears the selection | Reset clears the active selection | Passed |
| RESET_CHECKLIST — resets interval to daily | Reset returns interval to "daily" | Passed |
| SET_SELECTION — stores the selection | SET_SELECTION stores the selection payload | Passed |
| SET_SELECTION — replaces a prior selection | SET_SELECTION replaces a prior selection | Passed |
| CLEAR_SELECTION — sets selection back to null | CLEAR_SELECTION sets selection to null | Passed |
| CLEAR_SELECTION — is a no-op when selection is already null | CLEAR_SELECTION is a no-op when already null | Passed |
| unknown action — returns state unchanged | Unknown actions return state unchanged | Passed |
| isStepComplete — returns false when no items checked | isStepComplete is false when no items are checked | Passed |
| isStepComplete — returns true when all required items for step 0 are checked | isStepComplete is true when all required items checked | Passed |
| isStepComplete — returns false when only some required items are checked | isStepComplete is false when only some items checked | Passed |
| isStepComplete — returns false for an invalid step id | isStepComplete is false for an invalid step id | Passed |
| getNextInterval — 15min maps to 1h | Next interval after 15min is 1h | Passed |
| getNextInterval — 1h maps to 4h | Next interval after 1h is 4h | Passed |
| getNextInterval — 4h maps to daily | Next interval after 4h is daily | Passed |
| getNextInterval — daily maps to weekly | Next interval after daily is weekly | Passed |
| getNextInterval — weekly maps to null (no higher timeframe) | Weekly has no higher timeframe (null) | Passed |
| STEPS config — has exactly 5 steps | Steps config defines exactly 5 steps | Passed |
| STEPS config — each step has required fields | Each step has all required fields | Passed |
| STEPS config — step ids are sequential from 0 | Step ids are sequential starting from 0 | Passed |
| STEPS config — each step has at least one required item | Each step has at least one required item | Passed |
| STEPS config — each item key is unique across all steps | Item keys are unique across all steps | Passed |

---

## All Tests Passing

Previously-failing reducer tests are now green after fixes in [dashboardStore.js](client/src/context/dashboardStore.js):
- `ADVANCE_STEP` and `GO_TO_STEP` now union overlays across completed steps and the current step (new helper `mergeOverlaysForSteps`).
- `RESET_CHECKLIST` / `CLEAR_SELECTION` now reset interval to `'daily'`.
