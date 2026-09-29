"""Extract original images and their cell anchors; never alter the workbook."""
import hashlib
import json
import pathlib
import posixpath
import zipfile
import xml.etree.ElementTree as ET

root = pathlib.Path('output/support-import')
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships',
      'x': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}

def relationships(z, filename):
    relfile = posixpath.join(posixpath.dirname(filename), '_rels', posixpath.basename(filename) + '.rels')
    if relfile not in z.namelist():
        return {}
    return {v.attrib['Id']: posixpath.normpath(posixpath.join(posixpath.dirname(filename), v.attrib['Target']))
            for v in ET.fromstring(z.read(relfile)) if v.attrib.get('TargetMode') != 'External'}

images = []
with zipfile.ZipFile(root / 'source.xlsx') as z:
    workbook = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = relationships(z, 'xl/workbook.xml')
    for sheet in workbook.find('s:sheets', ns):
        sheetfile = sheets[sheet.attrib['{' + ns['r'] + '}id']]
        sheetrels = relationships(z, sheetfile)
        for drawing in ET.fromstring(z.read(sheetfile)).findall('s:drawing', ns):
            drawingfile = sheetrels[drawing.attrib['{' + ns['r'] + '}id']]
            rels = relationships(z, drawingfile)
            for anchor in ET.fromstring(z.read(drawingfile)):
                start = anchor.find('x:from', ns)
                blip = anchor.find('.//a:blip', ns)
                if start is None or blip is None:
                    continue
                media = rels[blip.attrib['{' + ns['r'] + '}embed']]
                content = z.read(media)
                digest = hashlib.sha256(content).hexdigest()
                target = root / 'images' / (digest + pathlib.Path(media).suffix)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                images.append({'sheet': sheet.attrib['name'], 'row': int(start.find('x:row', ns).text) + 1,
                               'column': int(start.find('x:col', ns).text) + 1,
                               'file': target.as_posix(), 'name': pathlib.Path(media).name,
                               'sha256': digest, 'bytes': len(content)})
(root / 'images.json').write_text(json.dumps(images, indent=2), encoding='utf-8')
print(json.dumps({'images': [{k: v for k, v in i.items() if k != 'sha256'} for i in images]}))
