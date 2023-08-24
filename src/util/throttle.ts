import { TextEditor } from "vscode";

export const throttle = (method: any, time: number) => {
    let throttlePause: boolean = false;
    return (editor?:TextEditor) => {
        if (throttlePause) {
            return;
        }
        throttlePause = true;
        setTimeout(() => {
            throttlePause = false;
        }, time);
        return method(editor);
    };
};

export const once = (fn: (...argss:any[])=>Promise<any>) => {
    let called = false;
    return async (...args:any[]) => {
      if (called){
         return;
        }
      called = true;
    const res = await fn.apply(this, args);
    called=false;
    return res;
    };
  };

  export const onceMemoize = (fn: (...argss:any[])=>Promise<any>, expire: number) => {
    const cache: {[args: string]:Promise<any>} = {};
    return async (...args:any[]) => {
        const argsString = JSON.stringify(args);
        if(!cache[argsString] && expire){
            setTimeout(()=>{
                delete cache[argsString];
            }, expire);
        }
        cache[argsString] = cache[argsString] || fn.apply(this, args);
        const res = await cache[argsString];
    return res;
    };
  };