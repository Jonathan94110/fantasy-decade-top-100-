import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceLocation,workspaceUrl} from '../hooks/use-workspace-location.ts';

const views=['overview','draft','roster','results'];
test('workspace URLs accept only known views and positive safe saved-round numbers',()=>{
 assert.deepEqual(workspaceLocation('?view=roster&replay=17',views,'overview'),{view:'roster',replayRound:17});
 for(const replay of ['0','-1','1.5','1e2','0001','9007199254740992','evil'])assert.equal(workspaceLocation(`?replay=${replay}`,views,'overview').replayRound,null);
 assert.deepEqual(workspaceLocation('?view=not-a-tab&replay=2',views,'overview'),{view:'overview',replayRound:2});
});
test('a location for a different saved season cannot select its view or replay',()=>{
 assert.deepEqual(workspaceLocation('?scope=season:old&view=results&replay=9',views,'overview','season:new'),{view:'overview',replayRound:null});
 assert.deepEqual(workspaceLocation('?scope=season:new&view=results&replay=9',views,'overview','season:new'),{view:'results',replayRound:9});
 assert.equal(workspaceLocation('?view=roster',views,'overview','season:new').view,'roster');
});
test('tab and replay navigation preserve selected league, other query values and anchor',()=>{
 const url=workspaceUrl('https://fixture.local/league?league=a%2Fb&keep=hello#center',{view:'results',replay:'3',scope:'season:a/b'});
 const parsed=new URL(url,'https://fixture.local');
 assert.equal(parsed.pathname,'/league');assert.equal(parsed.hash,'#center');
 assert.equal(parsed.searchParams.get('league'),'a/b');assert.equal(parsed.searchParams.get('keep'),'hello');
 assert.equal(parsed.searchParams.get('view'),'results');assert.equal(parsed.searchParams.get('replay'),'3');
 assert.equal(parsed.searchParams.get('scope'),'season:a/b');
});
test('leaving a league removes only workspace selection and preserves unrelated state',()=>{
 assert.equal(workspaceUrl('/league?league=one&view=roster&replay=1&scope=season%3Aone&keep=x',{league:null,view:null,replay:null,scope:null}),'/league?keep=x');
 assert.equal(workspaceUrl('/demo?view=roster',{desk:'draft'}),'/demo?view=roster&desk=draft');
});
