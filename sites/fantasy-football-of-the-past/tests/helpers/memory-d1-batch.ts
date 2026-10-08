import type {DatabaseSync,SQLInputValue} from 'node:sqlite';

type Statement={bind(...values:unknown[]):Statement;query?:string;values?:SQLInputValue[]};
type MemoryDatabase={sql:DatabaseSync;prepare(query:string):Statement};
type Options={fail?:()=>boolean;beforeWrite?:(statements:Statement[])=>Promise<void>|void};

/**
 * Adds D1's `batch` to an in-memory test database: every statement runs in one
 * SQLite transaction, and any error rolls the whole batch back, as in D1.
 * Statements run synchronously so concurrent test requests cannot interleave.
 */
export function withBatch<T extends MemoryDatabase>(db:T,options:Options={}):T&{batch(statements:Statement[]):Promise<{results:unknown[];meta:{changes:number}}[]>}{
 const prepare=db.prepare.bind(db);
 db.prepare=(query:string)=>{
  const statement=prepare(query),bind=statement.bind;
  statement.bind=function(...values:unknown[]){statement.query=query;statement.values=values as SQLInputValue[];return bind.apply(this,values);};
  return statement;
 };
 return Object.assign(db,{async batch(statements:Statement[]){
  await options.beforeWrite?.(statements);
  if(options.fail?.())throw new Error('PRIVATE BATCH STORAGE SECRET');
  db.sql.exec('BEGIN');
  try{
   const results=statements.map(statement=>{
    const query=db.sql.prepare(statement.query!),values=statement.values||[];
    return /^\s*select/i.test(statement.query!)?{results:query.all(...values),meta:{changes:0}}:{results:[],meta:{changes:Number(query.run(...values).changes)}};
   });
   db.sql.exec('COMMIT');return results;
  }catch(error){db.sql.exec('ROLLBACK');throw error;}
 }});
}
