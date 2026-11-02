import json,glob,statistics as st,collections,sys
d=sys.argv[1] if len(sys.argv)>1 else '.'
rows=collections.defaultdict(list)
for f in sorted(glob.glob(d+'/lh-*.json')):
    j=json.load(open(f)); a=j['audits']
    base=f.split('/')[-1]; name=base.split('-')[1]; page=base.split('-',2)[2].rsplit('-',1)[0]
    by={i['resourceType']:i for i in a['resource-summary']['details']['items']}
    rows[(page,name)].append(dict(score=j['categories']['performance']['score']*100,fcp=a['first-contentful-paint']['numericValue'],lcp=a['largest-contentful-paint']['numericValue'],tbt=a['total-blocking-time']['numericValue'],cls=a['cumulative-layout-shift']['numericValue'],js=by.get('script',{}).get('transferSize',0)/1024,total=by.get('total',{}).get('transferSize',0)/1024,req=by.get('total',{}).get('requestCount',0)))
pages={'home':'home (Curitiba)','PDP':'PDP','locadora':'locadora'}
def label(p): return 'home' if 'cidade' in p else 'PDP' if '_p_' in p else 'locadora'
print(f"{'página':10} {'versão':9} {'nota':>5} {'FCP':>7} {'LCP':>7} {'TBT':>6} {'CLS':>6} {'JS KB':>6} {'total KB':>9} {'req':>4}")
for (page,name),rs in sorted(rows.items(), key=lambda x:(label(x[0][0]),x[0][1]!='worker')):
    m=lambda k: st.median(r[k] for r in rs)
    print(f"{label(page):10} {name:9} {m('score'):5.0f} {m('fcp')/1000:6.2f}s {m('lcp')/1000:6.2f}s {m('tbt'):5.0f}ms {m('cls'):6.3f} {m('js'):6.0f} {m('total'):9.0f} {m('req'):4.0f}")
