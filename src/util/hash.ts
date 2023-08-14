import { createHash } from "crypto";

class Hash {
    private workspaceLocationToHash = new Map<string, string>();
    private workspaceHashToLocation = new Map<string, string>();
    private emailHash = new Map<string, string>();

    getWorkspaceLocationHash(location: string): string{
        if(this.workspaceLocationToHash.has(location)){
            return this.workspaceLocationToHash.get(location) as string;
        }
        const locationHash = createHash('sha256').update(location).digest('hex');
        this.workspaceLocationToHash.set(location, locationHash);
        this.workspaceHashToLocation.set(locationHash, location);
        return locationHash;
    }

    getWorkspaceLocation(locationHash: string): string | undefined{
        return this.workspaceHashToLocation.get(locationHash);
    }

    getEmailHash(email: string): string{
        if(this.emailHash.has(email)){
            return this.emailHash.get(email) as string;
        }
        const emailHash = createHash('sha256').update(email).digest('hex');
        this.emailHash.set(email, emailHash);
        return emailHash;
    }
}

const hash = new Hash();

export default hash;