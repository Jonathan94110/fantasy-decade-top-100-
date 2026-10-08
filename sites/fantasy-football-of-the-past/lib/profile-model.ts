export type Profile={displayName:string;username:string;about:string;avatar:string|null;receptionPoints:number;reduceMotion:boolean;revision:number};
export const emptyProfile=():Profile=>({displayName:'',username:'',about:'',avatar:null,receptionPoints:1,reduceMotion:false,revision:0});
export function validAvatar(value:unknown):value is string|null{
 if(value===null)return true;
 if(typeof value!=='string'||value.length>190000)return false;
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match)return false;
 let data:string;try{data=atob(match[2]);}catch{return false;}
 if(data.length<24||data.length>140000)return false;
 if(match[1]==='jpeg')return data.charCodeAt(0)===255&&data.charCodeAt(1)===216&&data.charCodeAt(2)===255&&data.charCodeAt(data.length-2)===255&&data.charCodeAt(data.length-1)===217;
 if(match[1]==='png')return data.slice(0,8)==='\x89PNG\r\n\x1a\n'&&data.slice(12,16)==='IHDR';
 return data.slice(0,4)==='RIFF'&&data.slice(8,12)==='WEBP';
}
export function validateProfile(input:Record<string,unknown>):Profile{
 for(const [key,limit] of [['displayName',50],['username',30],['about',300]] as const)if(typeof input[key]!=='string'||input[key].length>limit)throw new Error(`Check your ${key==='displayName'?'display name':key}.`);
 if(input.username&&!/^[a-zA-Z0-9_.-]{2,30}$/.test(String(input.username)))throw new Error('Use 2–30 letters, numbers, periods, hyphens or underscores for your username.');
 if(!validAvatar(input.avatar))throw new Error('Choose a small JPG, PNG or WebP profile image.');
 if(![0,.5,1].includes(Number(input.receptionPoints))||typeof input.reduceMotion!=='boolean')throw new Error('Choose valid profile settings.');
 if(!Number.isSafeInteger(input.revision)||Number(input.revision)<0)throw new Error('Refresh your saved profile.');
 return {displayName:String(input.displayName).trim(),username:String(input.username).trim(),about:String(input.about).trim(),avatar:input.avatar,receptionPoints:Number(input.receptionPoints),reduceMotion:input.reduceMotion,revision:Number(input.revision)};
}
