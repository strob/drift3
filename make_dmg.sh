pyinstaller --onedir -y serve.py

cd ext/calc_sbpca/python
pyinstaller --onedir -y SAcC.py

cd ../../../

# cd ext/gentle
# ln -s serve.py gentle_serve.py
# pyinstaller --onedir -y gentle_serve.py

# cd ../../

mkdir serve-dist
rsync -avzPL www dist/serve/ ext/calc_sbpca/python/dist/SAcC/ serve-dist/
#ext/gentle/dist/gentle_serve/
cp stage.py ffmpeg serve-dist/

# rsync -avzP ext/gentle/exp serve-dist/
# mkdir serve-dist/ext
# cp ext/gentle/ext/k3 ext/gentle/ext/m3 serve-dist/

# XXX: May need to modify the config
cp -r ext/calc_sbpca/python/aux ext/calc_sbpca/python/*.config serve-dist/


pyinstaller --windowed -y drift_gui.spec
mv serve-dist dist/drift_gui.app/Contents/Resources/


hdiutil create dist/drift3.dmg -volname "Drift3" -srcfolder dist/drift_gui.app/
