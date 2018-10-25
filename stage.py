import tempfile
import subprocess
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


def align(cmd):

    meta = rec_set.get_meta(cmd['id'])

    media = os.path.join(get_attachpath(), meta['path'])
    transcript = os.path.join(get_attachpath(), meta['transcript'])
    
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as fp:
        # XXX: Check if Gentle is running

        url = 'http://localhost:8765/transcriptions?async=false'

        t_opts = []
        if transcript:
            t_opts = ['-F', 'transcript=<%s' % (transcript)]
            # Adding disfluencies may be unreliable...
            # url += '&disfluency=true'

        # XXX: can I count on `curl` on os x? I think so?
        subprocess.call(['curl',
                '-o', fp.name,
                '-X', 'POST',
                '-F', 'audio=@%s' % (media)] + t_opts + [url])

    alignhash = guts.attach(fp.name, get_attachpath())

    guts.bschange(rec_set.dbs[cmd['id']], {
        "type": "set",
        "id": "meta",
        "key": "align",
        "val": alignhash
        })
    
    return {"align": alignhash}
    

root.putChild("_align", guts.PostJson(align, async=True))
