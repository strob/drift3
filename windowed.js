function get_windowed(window_duration, step_duration) {
  let active = Object.entries(T.active)
    .filter(x => x[1])
    .map(x => x[0]);
  if (active.length !== 1) {
    alert("Please expand exactly one recording.");
    return;
  }
  const recording_id = active[0];
  const doc = T.docs[recording_id];

  // Estimate duration from pitch results
  const pitch = D.urls["/media/" + doc.pitch];
  if (!pitch) {
    alert(
      "Pitch has not yet loaded. Please wait until you can see the pitch trace, and then try running this function again."
    );
    return;
  }

  const duration = pitch.length / 100; // seconds

  const output = {}; // start_time -> result object

  let n_reqs = 0;

  for (let t = 0; t < duration; t += step_duration) {
    n_reqs += 1;

    (start_time => {
      fetch(
        `/_measure?id=${recording_id}&start_time=${start_time}&end_time=${Math.min(
          duration,
          start_time + window_duration
        )}`
      )
        .then(x => x.json())
        .then(res => {
          n_reqs -= 1;
          output[start_time] = res;
          if (n_reqs === 0) {
            console.log("output=", output);
            window.output = output;
          } else {
            const n_out = Object.keys(output).length;
            console.log(`Got result ${n_out} of ${n_out + n_reqs}`);
          }
        });
    })(t);
  }
}
