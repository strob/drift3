import tempfile
import subprocess
import json
import os

def pitch(cmd):
    docid = cmd['id']

    meta = rec_set.get_meta(docid)

    # Create an 8khz wav file
    with tempfile.NamedTemporaryFile(suffix='.wav') as wav_fp:
        subprocess.call([get_ffmpeg(),
                         '-y',
                         '-loglevel', 'panic',
                         '-i', os.path.join(get_attachpath(), meta['path']),
                         '-ar', '8000',
                         '-ac', '1',
                         wav_fp.name])

        # ...and use it to compute pitch
        with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as pitch_fp:
            subprocess.call([get_calc_sbpca(),
                             wav_fp.name, pitch_fp.name])

    if len(open(pitch_fp.name).read().strip()) == 0:
        return {"error": "Pitch computation failed"}

    # XXX: frozen attachdir
    pitchhash = guts.attach(pitch_fp.name, get_attachpath())

    guts.bschange(rec_set.dbs[docid], {
        "type": "set",
        "id": "meta",
        "key": "pitch",
        "val": pitchhash
        })
    
    return {"pitch": pitchhash}

root.putChild("_pitch", guts.PostJson(pitch, async=True))

def parse_speakers_in_transcript(trans):
    segs = []

    cur_speaker = None
    for line in trans.split('\n'):
        if ':' in line and line.index(':') < 30:
            cur_speaker = line.split(':')[0]
            line = ':'.join(line.split(':')[1:])

        line = line.strip()
        if len(line) > 0:
            segs.append({'speaker': cur_speaker,
                         'line': line})

    return segs

def gentle_punctuate(wdlist, transcript):
    # Use the punctuation from Gentle's transcript in a wdlist
    out = []

    last_word_end = None
    next_aligned_wd = None
    
    for wd_idx,wd in enumerate(wdlist):
        next_wd_idx = wd_idx + 1
        next_wd = None

        is_aligned = wd.get('end') is not None

        while next_wd_idx < len(wdlist):
            next_wd = wdlist[next_wd_idx]
            if next_wd.get('startOffset') is not None:
                break
            next_wd_idx += 1

        if not is_aligned:
            next_wd_idx = wd_idx + 1
            while next_wd_idx < len(wdlist):
                next_aligned_wd = wdlist[next_wd_idx]
                if next_aligned_wd.get('end') is not None:
                    break
                else:
                    next_aligned_wd = None
                next_wd_idx += 1

        if next_wd is None or next_wd.get('startOffset') is None:
            # No next word - don't glob punctuation, just return what we have.

            keys = ['start', 'end', 'phones']

            wd_obj = {'word': wd['word']}
            for key in keys:
                if key in wd:
                    wd_obj[key] = wd[key]
            
            out.append(wd_obj)
            break

        if 'startOffset' not in wd:# or 'startOffset' not in next_wd:
            continue
        if wd.get('startOffset') is not None:
            wd_str = transcript[wd['startOffset']:next_wd['startOffset']]

            keys = ['start', 'end', 'phones']

            wd_obj = {'word': wd_str}
            for key in keys:
                if key in wd:
                    wd_obj[key] = wd[key]

            out.append(wd_obj)

    return out



def align(cmd):
    meta = rec_set.get_meta(cmd['id'])

    media = os.path.join(get_attachpath(), meta['path'])
    segs = parse_speakers_in_transcript(
        open(
            os.path.join(get_attachpath(), meta['transcript'])).read())

    with tempfile.NamedTemporaryFile(suffix='.txt') as txtfp:
        txtfp.write('\n'.join([X['line'] for X in segs]))
        txtfp.flush()

        print("tscript - ", txtfp.name)
        # txtfp.close()

        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as fp:
            # XXX: Check if Gentle is running

            url = 'http://localhost:8765/transcriptions?async=false'

            t_opts = []
            t_opts = ['-F', 'transcript=<%s' % (txtfp.name)]
            # Adding disfluencies may be unreliable...
            # url += '&disfluency=true'

            # XXX: can I count on `curl` on os x? I think so?
            subprocess.call(['curl',
                    '-o', fp.name,
                    '-X', 'POST',
                    '-F', 'audio=@%s' % (media)] + t_opts + [url])

            trans = json.load(open(fp.name))

    # Re-diarize Gentle output into a sane diarization format

    diary = {'segments': [{}]}
    seg = diary['segments'][0]
    seg['speaker'] = segs[0]['speaker']
    
    wdlist = []
    end_offset = 0
    seg_idx = 0
    
    for wd in trans['words']:
        gap = trans['transcript'][end_offset:wd['startOffset']]
        seg_idx += len(gap.split('\n'))-1

        if '\n' in gap and len(wdlist) > 0:
            # Linebreak - new segment!
            wdlist[-1]['word'] += gap.split('\n')[0]

            seg['wdlist'] = gentle_punctuate(wdlist, trans['transcript'])

            wdlist = []
            seg = {}
            diary['segments'].append(seg)
            if len(segs) > seg_idx:
                seg['speaker'] = segs[seg_idx]['speaker']

        wdlist.append(wd)
        end_offset = wd['endOffset']

    seg['wdlist'] = gentle_punctuate(wdlist, trans['transcript'])

    # For now, hit disk. Later we can explore the transcription DB.
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as dfh:
        json.dump(diary, dfh, indent=2)
    
        alignhash = guts.attach(dfh.name, get_attachpath())

    guts.bschange(rec_set.dbs[cmd['id']], {
        "type": "set",
        "id": "meta",
        "key": "align",
        "val": alignhash
        })
    
    return {"align": alignhash}
    

root.putChild("_align", guts.PostJson(align, async=True))
