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