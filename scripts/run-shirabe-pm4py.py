import json, platform, sys, time
from datetime import datetime
import pandas as pd
import pm4py

source, destination = sys.argv[1], sys.argv[2]
cases = json.load(open(source, encoding="utf-8"))
results = []
for case in cases:
    started = time.perf_counter()
    valid = []
    for row in case.get("event_rows", []):
        if len(row) == 4 and all(row[:3]):
            try:
                datetime.fromisoformat(row[2].replace("Z", "+00:00")); valid.append(row)
            except ValueError: pass
    if len(valid) < 2:
        results.append({"case_id":case["id"],"applicability":"not_applicable","reason":"insufficient valid case/activity/timestamp rows","input_events":len(case.get("event_rows",[])),"valid_events":len(valid),"latency_ms":round((time.perf_counter()-started)*1000,3)})
        continue
    frame = pd.DataFrame(valid, columns=["case:concept:name","concept:name","time:timestamp","source_row_id"])
    frame["time:timestamp"] = pd.to_datetime(frame["time:timestamp"], utc=True)
    frame = pm4py.format_dataframe(frame, case_id="case:concept:name", activity_key="concept:name", timestamp_key="time:timestamp")
    variants = pm4py.get_variants_as_tuples(frame)
    dfg, starts, ends = pm4py.discover_dfg(frame)
    durations = pm4py.get_all_case_durations(frame)
    results.append({"case_id":case["id"],"applicability":"full" if len(valid)==case.get("expected_events") else "partial","input_events":len(case.get("event_rows",[])),"valid_events":len(valid),"source_row_ids":[r[3] for r in valid],"cases":int(frame["case:concept:name"].nunique()),"variants":len(variants),"dfg_edges":len(dfg),"start_activities":len(starts),"end_activities":len(ends),"mean_case_duration_seconds":round(sum(durations)/len(durations),3) if durations else None,"latency_ms":round((time.perf_counter()-started)*1000,3)})
json.dump({"tool":"PM4Py","version":pm4py.__version__,"python":platform.python_version(),"results":results}, open(destination,"w",encoding="utf-8"), indent=2)
