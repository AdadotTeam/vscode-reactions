import {ProjectInfoResponse} from "../types/app";

class Store {
    public workspaceInfo = new Map<string, ProjectInfoResponse['projects'][number]>();
}

const store = new Store();
export default store;