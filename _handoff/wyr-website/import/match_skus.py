"""Match Lazada SellerSKUs to Shopee SKUs for the WYR website. Output: sku_mapping.csv"""
import pandas as p, glob, re
D='/workspace/catalog-export/wyr-technology/'
s=p.read_excel(glob.glob(D+'mass_update_sales*')[0],header=2,engine='calamine').iloc[3:]
s=s[s['SKU'].notna()|s['Parent SKU'].notna()].copy()
s['sku']=s['SKU'].fillna(s['Parent SKU']).astype(str).str.strip()
l=p.read_excel(glob.glob(D+'pricestock*')[0],sheet_name='template',header=0,engine='calamine').iloc[3:]
l=l[l['SellerSKU'].notna()].copy(); l['SellerSKU']=l['SellerSKU'].astype(str).str.strip()
shop=set(s['sku'].str.lower())
def match(sku):
    k=sku.lower().replace('porket_','pocket_')
    if k in shop: return k,1,'exact'
    m=re.match(r'(wholesale|pack|set)?(\d+)?[_-]?(.*)',k); pack=1
    parts=k.split('_')
    for i in range(1,len(parts)):
        cand='_'.join(parts[i:]); pre='_'.join(parts[:i])
        n=re.findall(r'\d+',pre); pack=int(n[0]) if n else 1
        if cand in shop: return cand,pack,'prefix_rule'
    return '',1,'unmatched'
r=l[['Product ID','Product Name','SellerSKU','Price','SpecialPrice']].copy()
r[['shopee_sku','pack_qty','method']]=r['SellerSKU'].apply(lambda x:p.Series(match(x)))
r.to_csv('sku_mapping.csv',index=False)
print(len(s),'shopee skus;',len(r),'lazada skus'); print(r['method'].value_counts().to_string())
# Rechard 12 Oct: inactive items are dropped; remaining unmatched active items become Lazada-only products
inactive=re.compile(r'desfireev12k|rfid9954|^4063299383|^r01[346]|hc001',re.I)
r.loc[(r.method=='unmatched')&r.SellerSKU.str.contains(inactive),'method']='excluded_inactive'
r.loc[r.method=='unmatched','method']='lazada_only'
r.to_csv('sku_mapping.csv',index=False); print(r['method'].value_counts().to_string()); print(r[r.method=='lazada_only'].SellerSKU.tolist())
