'use client';
import {GameHeader} from '@/components/game-header';
import {CatalogNavigation} from '@/components/catalog-navigation';
import {EraLibrary} from '@/components/era-library';
export default function LegendsPage() {
  return <div className="fantasy-app classic-library-page"><GameHeader active="legends"/><main className="ff-main"><CatalogNavigation active="classic"/><EraLibrary initialCollection="classic" used={[]} canDraft={false} onDraft={() => {}}/></main></div>;
}
