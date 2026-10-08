'use client';
import {useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
export function SeasonReset({busy,onReset}:{busy:boolean;onReset:()=>Promise<boolean>}){
 const [open,setOpen]=useState(false);
 return <><button className="season-reset-button" disabled={busy} onClick={()=>setOpen(true)}><RotateCcw size={16}/> Reset season</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="season-reset-dialog" showCloseButton={!busy} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}><DialogTitle>Start the whole process over?</DialogTitle><DialogDescription>Your current solo season will move to a private backup. You’ll return to fresh setup and choose everything again.</DialogDescription><ul><li>Team count, team names, playoff format and scoring</li><li>Draft order, every pick, roster and lineup</li><li>Season progress, results, trades and used-game history</li></ul><p>Your profile, the player archive and other leagues stay unchanged. You can restore a backup from the setup screen.</p><div className="season-button-row"><button className="secondary-button" disabled={busy} onClick={()=>setOpen(false)}>Keep my season</button><button className="primary-button" disabled={busy} onClick={async()=>{if(await onReset())setOpen(false);}}>{busy?'Saving backup…':'Back up & reset season'}</button></div></DialogContent></Dialog></>;
}
