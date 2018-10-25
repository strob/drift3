import guts
from twisted.web.static import File

root = guts.Root(port=9899, interface='127.0.0.1', dirpath='www')

db = guts.Babysteps("local/db")

recording = guts.BSFamily('recording')
root.putChild('_rec', recording.res)

clip = guts.BSFamily('clip')
root.putChild('_clip', clip.res)

root.putChild("_db", db)
root.putChild("_attach", guts.Attachments())
root.putChild('_stage', guts.Codestage(wwwdir='www'))

root.putChild('media', File('local/_attachments'))

guts.serve('stage.py', globals(), root=root)
