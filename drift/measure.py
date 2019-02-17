# Measurements.

from lempel_ziv_complexity import lempel_ziv_complexity
import numpy as np
import functools


def smooth(y, N=10):
    if len(y) < N:
        return y

    arr = np.array(y)
    win = np.hanning(N)

    return np.convolve(arr, win, mode="same").tolist()


class Measure:
    def __init__(self, pitch, alignment=None):
        self.pitch = pitch
        self.alignment = alignment

    def _raw_compute(self, start_time=None, end_time=None):
        stat_list = []
        for seg in self.alignment["segments"]:
            if end_time is not None and seg["start"] > end_time:
                break
            if start_time is not None and seg["end"] < start_time:
                continue

            seg_st = seg["start"]
            if start_time is not None:
                seg_st = max(seg_st, start_time)
            seg_end = seg["end"]
            if end_time is not None:
                seg_end = min(end_time, seg_end)

            stat_list.append(self._raw_measure_for_segment(seg, seg_st, seg_end))

        stats = self._accumulate_stats(stat_list)
        return stats

    def compute(self, start_time=None, end_time=None):
        stats = self._raw_compute(start_time, end_time)
        return self._compute_measure(stats)

    def _raw_measure_for_segment(self, segment, start_time=0, end_time=None):
        out = {}

        wdlist, pitch = self._trim_segment(segment, start_time, end_time)

        out["pitched"] = [X for X in pitch if X > 20]

        # Compute pitch velocity and acceleration deltas on smoothed
        # voiced chunks, in log-space.

        # first, get pitched chunks
        is_pitched = False
        pitched_chunks = []
        cur_pitches = None
        for p_val in pitch:
            if is_pitched:
                if p_val < 20:
                    # End a pitched chunk
                    is_pitched = False
                else:
                    cur_pitches.append(p_val)
            else:
                if p_val > 20:
                    # Start a pitched chunk!
                    is_pitched = True
                    cur_pitches = [p_val]
                    pitched_chunks.append(cur_pitches)

        # then, smooth out each pitched segment
        pitched_chunks = [smooth(ch) for ch in pitched_chunks]

        # pitch_dt -
        dt_chunks = []
        for ch in pitched_chunks:
            dt_chunk = []
            dt_chunks.append(dt_chunk)
            for idx, p1_val in enumerate(ch[:-1]):
                p2_val = ch[idx + 1]
                dt_chunk.append(abs(np.log2(p1_val) - np.log2(p2_val)))

        # pitch_dv -
        dv_chunks = []
        for ch in dt_chunks:
            dv_chunk = []
            dv_chunks.append(dv_chunk)
            for idx, p1_val in enumerate(ch[:-1]):
                p2_val = ch[idx + 1]
                dv_chunk.append(abs(p1_val - p2_val))

        out["pitch_log_deltas"] = functools.reduce(lambda acc, x: acc + x, dt_chunks, [])
        out["pitch_velocity_deltas"] = functools.reduce(
            lambda acc, x: acc + x, dv_chunks, []
        )

        if len(wdlist) == 0:
            return out

        if end_time is None:
            end_time = wdlist[-1]["end"]

        out["duration"] = end_time - start_time

        out["number_of_words"] = len([X for X in wdlist if X.get("word") is not None])

        out["number_of_phonemes"] = sum([len(X.get("phones", [])) for X in wdlist])

        out["number_of_long_pauses"] = len(
            [
                X
                for X in wdlist
                if X.get("type") == "gap"
                and (X["end"] - X["start"] > 0.5)
                and (X["end"] - X["start"] < 2)
            ]
        )

        pauses = [
            X
            for X in wdlist
            if X.get("type") == "gap"
            and (X["end"] - X["start"] > 0.1)
            and (X["end"] - X["start"] < 2)
        ]
        out["number_of_pauses"] = len(pauses)

        out["pause_duration"] = sum([X["end"] - X["start"] for X in pauses])

        # Based on `prosodic_measures.py`, accumulate a binary string indicating gap or non-gap, sampled at 100hz.

        wd_s = ""
        voice_s = ""

        cur_t = start_time
        cur_wd_idx = 0
        cur_pitch_idx = 0
        while cur_t < end_time:
            # Word sequence
            obj = wdlist[cur_wd_idx]
            if obj.get("type") == "gap":
                wd_s += "0"
            else:
                wd_s += "1"

            # ...voiced sequence
            if pitch[cur_pitch_idx] > 20:
                voice_s += "1"
            else:
                voice_s += "0"

            cur_t += 0.01
            if len(pitch) > cur_pitch_idx + 1:
                cur_pitch_idx += 1
            if obj["end"] < cur_t and len(wdlist) > cur_wd_idx + 1:
                cur_wd_idx += 1

        out["word_gap_sequence"] = wd_s
        out["voiced_gap_sequence"] = voice_s

        return out

    def _accumulate_stats(self, stat_list):
        # Does everything just sum?
        out = {}
        if len(stat_list) > 0:
            for key in stat_list[0].keys():
                out[key] = functools.reduce(
                    lambda acc, x: acc + x, [S[key] for S in stat_list],
                )
        return out

    def _compute_measure(self, stats):
        out = {}
        if stats["number_of_pauses"]:
            out["mean_pause_duration"] = (
                stats["pause_duration"] / stats["number_of_pauses"]
            )
        else:
            out["mean_pause_duration"] = 0

        out["words_per_minute"] = stats["number_of_words"] / (stats["duration"] / 60.0)
        out["phonemes_per_minute"] = stats["number_of_phonemes"] / (
            stats["duration"] / 60.0
        )

        out["long_pauses_per_minute"] = stats["number_of_long_pauses"] / (
            stats["duration"] / 60.0
        )

        # Replace "entropy" with "chroma_uniformity"
        n_bins = 10
        # quantize to 25 bins, per-octave
        chroma = [int((np.log2(X) % 1) * n_bins) for X in stats["pitched"]]
        # return the ratio of 10th to 90th percentile
        cnts = {}
        for c in chroma:
            cnts[c] = cnts.get(c, 0) + 1
        cnts = sorted(cnts.values())
        out["octave_variation"] = cnts[-2] / max(1, cnts[1])

        # filter pitch within 9-91% distribution
        pitched = sorted(stats["pitched"])
        trim_pt = int(len(pitched) * 0.09)
        pitched = pitched[trim_pt:-trim_pt]

        min_pitch = pitched[0]
        max_pitch = pitched[-1]

        out["pitch_range_octaves"] = np.log2(max_pitch / min_pitch)

        out["log_mean_pitch_hz"] = 2 ** (
            sum([np.log2(X) for X in pitched]) / len(pitched)
        )

        # pitch speed (octaves/sec)
        out["pitch_speed_octaves"] = 100 * (
            sum(stats["pitch_log_deltas"]) / len(stats["pitch_log_deltas"])
        )
        # pitch accel (octaves/sec^2)
        out["pitch_acceleration"] = 100 * (
            sum(stats["pitch_velocity_deltas"]) / len(stats["pitch_velocity_deltas"])
        )

        wd_s = stats["word_gap_sequence"]
        voice_s = stats["voiced_gap_sequence"]

        out["rhythmic_complexity_of_pauses_between_words"] = lempel_ziv_complexity(
            wd_s
        ) / (len(wd_s) / np.log2(len(wd_s)))
        out[
            "rhythmic_complexity_of_pauses_between_voiced_periods"
        ] = lempel_ziv_complexity(voice_s) / (len(voice_s) / np.log2(len(voice_s)))

        return out

    def _trim_segment(self, segment, start_time, end_time):
        # Compute measures for some or all of a segment
        wdlist = segment["wdlist"]
        pitch = self.pitch

        # print("trim", segment, start_time, end_time)

        # 1. Trim segment words & pitch
        if start_time is not None:
            wdlist = [X for X in wdlist if X.get("end") and X["end"] > start_time]
            pitch = pitch[int(start_time * 100) :]
        else:
            start_time = 0

        if end_time is not None:
            wdlist = [X for X in wdlist if X["start"] < end_time]
            pitch = pitch[: int((end_time - start_time) * 100) + 1]

        return wdlist, pitch
