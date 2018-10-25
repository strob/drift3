import guts
from twisted.web.static import File

BUNDLE=False

def get_ffmpeg():
    if BUNDLE:
        return './ffmpeg'
    return 'ffmpeg'
def get_local():
    if BUNDLE:
        return os.path.join(os.environ['HOME'], '.drift3', 'local')
    return 'local'
def get_attachpath():
    return os.path.join(get_local(), '_attachments')
def get_calc_sbpca():
    if BUNDLE:
        return './SAcC'
    return './ext/calc_sbpca/python/SAcC.py'


root = guts.Root(port=9899, interface='127.0.0.1', dirpath='www')

db = guts.Babysteps("local/db")

rec_set = guts.BSFamily('recording')
root.putChild('_rec', rec_set.res)

tran_set = guts.BSFamily('transcript')
root.putChild('_trans', tran_set.res)

root.putChild("_db", db)
root.putChild("_attach", guts.Attachments())
root.putChild('_stage', guts.Codestage(wwwdir='www'))

root.putChild('media', File('local/_attachments'))

guts.serve('stage.py', globals(), root=root)
