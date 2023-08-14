export const evaluateMapEquality = (newMap?: Map<any, any>, oldMap?: Map<any, any>): boolean => {
    if(newMap === undefined){
        if(oldMap === undefined){
            return true;
        }
        return false;
    }
    if(oldMap === undefined){
        if(newMap === undefined){
            return true;
        }
        return false;
    }
    if(newMap.size !== oldMap.size){
        return false;
    }
    if(JSON.stringify(Array.from(newMap.keys()))!==JSON.stringify(Array.from(oldMap.keys()))){
        return false;
    }
    for(const [key, value] of newMap.entries()){
        if(JSON.stringify(value)!==JSON.stringify(oldMap.get(key))){
            return false;
        }
    }
    return true;
};