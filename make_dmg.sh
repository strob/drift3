pyinstaller --onedir -y serve.py

cd ext/calc_sbpca/python
pyinstaller --onedir -y SAcC.py

cd ../../../

mkdir serve-dist
rsync -avzP www dist/serve/ ext/calc_sbpca/python/dist/SAcC/ serve-dist/
cp stage.py ffmpeg serve-dist/

# XXX: May need to modify the config
cp -r ext/calc_sbpca/python/aux calc_sbpca/python/*.config serve-dist/

pyinstaller --windowed -y drift.spec

mv serve-dist dist/drift.app/Contents/Resources/


# hdiutil create dist/drift.dmg -volname "Drift2" -srcfolder dist/drift.app/
