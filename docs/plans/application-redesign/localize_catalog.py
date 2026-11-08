"""Build explicit English/Dutch design fixtures; use existing application translations first."""
from pathlib import Path
import json
BASE=Path(__file__).parent
ROOT=BASE.parents[2]
def translations():
 result={}
 def pair(n,e):
  if isinstance(n,str) and isinstance(e,str):result[n]=e
  elif isinstance(n,dict) and isinstance(e,dict):
   for k in n.keys()&e.keys():pair(n[k],e[k])
 for directory in [ROOT/'src/locales',*(ROOT/'src/features').glob('*/locales')]:
  if (directory/'nl.json').exists() and (directory/'en.json').exists():pair(json.loads((directory/'nl.json').read_text()),json.loads((directory/'en.json').read_text()))
 for line in (BASE/'copy-translations.tsv').read_text().splitlines():
  if '\t' in line:
   nl,en=line.split('\t',1);result[nl]=en
 return result
T=translations()
# Translate complete authored phrases. Never replace words inside already translated text.
def english(s):
 return T.get(s,s)
SKIP={'id','to','owner','kind','route','currentRoute','source','sourceFields','status','generatedFrom','components','features','mediaKey','coverKey'}
def convert(value,key=''):
 if key in SKIP:return value
 if isinstance(value,str):return english(value)
 if isinstance(value,list):return [convert(x,key) for x in value]
 if isinstance(value,dict):return {k:convert(v,k) for k,v in value.items()}
 return value
if __name__=='__main__':
 original=json.loads((BASE/'catalog.nl.json').read_text())
 allowed={'Cindy','Gamma','Gamma-7-november.pdf','Garage','Google Drive','Internet','Rob','Yoghurt'}
 def assert_copy(v,k=''):
  if k in SKIP:return
  if isinstance(v,str):assert v in T or v in allowed, f'Missing reviewed English design copy: {v}'
  elif isinstance(v,list):
   for x in v:assert_copy(x,k)
  elif isinstance(v,dict):
   for key,x in v.items():assert_copy(x,key)
 assert_copy(original)
 (BASE/'catalog.json').write_text(json.dumps(convert(original),ensure_ascii=False,indent=2)+'\n')
 # Include a dictionary for all static preview strings and complete fixture values.
 allT={**T}
 def collect(v,k=''):
  if k in SKIP:return
  if isinstance(v,str):allT[v]=english(v)
  elif isinstance(v,list):
   for x in v:collect(x,k)
  elif isinstance(v,dict):
   for k,x in v.items():collect(x,k)
 collect(original)
 # Keep preview-only copy reproducible; production continues to use its locale namespaces.
 reverse={en:nl for nl,en in allT.items() if en!=nl}
 (BASE/'preview/design-copy.json').write_text(json.dumps(reverse,ensure_ascii=False,indent=2)+'\n')
