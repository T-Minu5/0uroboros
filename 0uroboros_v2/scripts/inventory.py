from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parents[1]
inspected={'slash-dot.png','dotkrawler.png','rezz-razor.png','rezz-blade.png','cardback_02_silicone.png','game-board_with cards.png','game-board_without cards.png','fx-24-occult-big-attack.webp','fx-19-quantum.webp','fx-32-heal.webp','fx-40-heal-occult.webp','fx-15-destroy.webp','fx-46-occult-quantum.webp'}
rows=[]
for folder in ['0uroboros_v3_1_clean_start','0uroboros_implementation_v2','assets','src','tests']:
 for p in sorted((root/folder).rglob('*')):
  if not p.is_file() or p.name.startswith('.') or p.suffix in ['.blend1']:continue
  rel=str(p.relative_to(root));tags=[]
  if folder=='0uroboros_v3_1_clean_start':kind='authority-package';authority='V3.1'
  elif '/board/' in rel:kind='board-concept';authority='FIRST_PARTY_LAYOUT_AUTHORITY';tags=['BOARD_CONCEPT','HAND_LAYOUT_REFERENCE' if 'with cards' in p.name else 'BASE_LAYOUT_REFERENCE']
  elif '/effect_animations/' in rel:kind='effect-reference';authority='reference-only';tags=[x for x in ['quantum','occult','heal','attack','destroy'] if x in p.name]
  elif '/card_art/' in rel:kind='identity-art';authority='first-party'
  elif '/Icons/' in rel:kind='icon';authority='first-party'
  elif '/models/' in rel:kind='authored-board';authority='implementation'
  elif '/Interface Elements/' in rel:kind='interface-reference';authority='first-party'
  else:kind=folder;authority='implementation'
  rows.append({'id':rel,'path':rel,'sourceClass':kind,'authorityClass':authority,'mediaType':p.suffix[1:] or 'unknown','tags':tags,'visualInspection':p.name in inspected or '/Icons/' in rel or '/card_art/' in rel,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
out={'generatedAt':'2026-09-23','authorityPackage':'0uroboros_v3_1_clean_start','sources':rows,'tooling':{'BlenderMCP':'Available. 1.0.3 connector; board authored/exported through Blender MCP; see docs/BOARD_BUILD.md'},'externalReferenceLibrary':'../0uroboros/0uroboros_swarm_v2_0/06_RESOURCE_LIBRARY.md','contentGaps':['Full Base/Chaos/VP/Crypto definitions not present in assets. Art does not define mechanics.','Location effects/rewards and Circuit offerings not found in supplied V3.1 assets.','ART_ASSET_MISSING: Byte-Coin, Kilo-Coin, Vault Encryption identity illustrations; neutral labeled placeholders used instead of unrelated named art.'],'sourceConflicts':['Concept art example DC values 2400/1600 yield to canonical rules 2000/1500.','Existing prototype had ten-card opening, fixed opponent, invented Wallet/weights and nonfunctional purchases; replaced with local session.','Historical Location source explicitly placeholder content referencing deprecated Cipher runner; not imported as canon.'],'iconSemantics':{x:x.replace('-',' ') for x in ['actions','crypto','power','database','deck','discard','hand','duration','priority','trash','runtime']}}
(root/'docs/generated/SOURCE_INVENTORY.json').write_text(json.dumps(out,indent=2)+'\n')
print('Inventoried',len(rows),'files')
from collections import Counter
print(dict(Counter(r['sourceClass'] for r in rows)))
