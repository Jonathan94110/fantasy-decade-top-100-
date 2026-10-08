export function CatalogNavigation({active}:{active:'classic'|'preview'}){
 return <nav className="catalog-subnav" aria-label="Player catalogs"><a href="/legends" aria-current={active==='classic'?'page':undefined}>Classic Legends</a><a href="/historical-preview" aria-current={active==='preview'?'page':undefined}>Historical preview <span>1960–1998</span></a></nav>;
}
