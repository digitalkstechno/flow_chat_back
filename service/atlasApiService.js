const axios = require('axios');
const crypto = require('crypto');
// Utilizing a custom digest request function for Atlas API since it uses Digest Auth
const { encrypt, decrypt } = require('../utils/encryption');

class AtlasApiService {
    constructor() {
        this.publicKey = process.env.ATLAS_PUBLIC_KEY;
        this.privateKey = process.env.ATLAS_PRIVATE_KEY;
        this.orgId = process.env.ATLAS_ORG_ID;
        this.baseUrl = 'https://cloud.mongodb.com/api/atlas/v2';
    }

    // Basic Digest Auth Implementation
    async request(method, endpoint, data = null) {
        const url = `${this.baseUrl}${endpoint}`;

        // Initial request to get 401 and WWW-Authenticate header
        let authHeader;
        try {
            await axios({ method, url, headers: { 'Accept': 'application/vnd.atlas.2023-01-01+json' } });
        } catch (err) {
            if (err.response && err.response.status === 401) {
                authHeader = err.response.headers['www-authenticate'];
            } else {
                throw err;
            }
        }

        if (!authHeader) throw new Error("Failed to get digest auth challenge from Atlas API");

        const digestInfo = this.parseDigestInfo(authHeader);
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        const path = new URL(url).pathname;

        const ha1 = crypto.createHash('md5').update(`${this.publicKey}:${digestInfo.realm}:${this.privateKey}`).digest('hex');
        const ha2 = crypto.createHash('md5').update(`${method}:${path}`).digest('hex');

        const responseStr = `${ha1}:${digestInfo.nonce}:${nc}:${cnonce}:${digestInfo.qop}:${ha2}`;
        const response = crypto.createHash('md5').update(responseStr).digest('hex');

        const authString = `Digest username="${this.publicKey}", realm="${digestInfo.realm}", nonce="${digestInfo.nonce}", uri="${path}", qop=${digestInfo.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}", algorithm=${digestInfo.algorithm}`;

        const config = {
            method,
            url,
            headers: {
                'Accept': 'application/vnd.atlas.2023-01-01+json',
                'Authorization': authString
            },
            data
        };

        const res = await axios(config);
        return res.data;
    }

    parseDigestInfo(authHeader) {
        const parts = authHeader.replace('Digest ', '').split(', ');
        const info = {};
        for (const part of parts) {
            const [key, value] = part.split('=');
            info[key] = value.replace(/"/g, '');
        }
        return info;
    }

    // 1. Create Organization (Usually restricted, but here's the API call if allowed by key)
    async createOrganization(orgName) {
        try {
            // Atlas API primarily allows creating Projects within existing Org. 
            // POST /api/atlas/v2/orgs is available for some partners.
            // Assuming ATLAS_ORG_ID is used by default if provided.
            if (this.orgId) {
                return { id: this.orgId, name: orgName, _mocked: true };
            }
            return await this.request('POST', '/orgs', { name: orgName });
        } catch (error) {
            console.error("Atlas createOrganization Error:", error.response?.data || error.message);
            throw new Error("Atlas organization creation failed.");
        }
    }

    // 2. Create Project
    async createProject(orgId, projectName) {
        try {
            return await this.request('POST', `/groups`, { orgId, name: projectName });
        } catch (error) {
            console.error("Atlas createProject Error:", error.response?.data || error.message);
            throw new Error(`Atlas project creation failed: ${error.response?.data?.detail || error.message}`);
        }
    }

    // 3. Create Network Access
    async createNetworkAccess(projectId, cidrBlock = "0.0.0.0/0", comment = "Auto Generated Access") {
        try {
            return await this.request('POST', `/groups/${projectId}/accessList`, [{
                cidrBlock,
                comment
            }]);
        } catch (error) {
            console.error("Atlas createNetworkAccess Error:", error.response?.data || error.message);
            throw new Error("Atlas network access creation failed.");
        }
    }

    // 4. Create Database User
    async createDatabaseUser(projectId, username, password) {
        try {
            return await this.request('POST', `/groups/${projectId}/databaseUsers`, {
                databaseName: "admin",
                password: password,
                roles: [{ databaseName: "admin", roleName: "readWriteAnyDatabase" }],
                username: username
            });
        } catch (error) {
            console.error("Atlas createDatabaseUser Error:", error.response?.data || error.message);
            throw new Error("Atlas database user creation failed.");
        }
    }

    // Get Clusters
    async getClusters(projectId) {
        try {
            return await this.request('GET', `/groups/${projectId}/clusters`);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return { results: [] }; // Project already doesn't exist
            }
            console.error("Atlas getClusters Error:", error.response?.data || error.message);
            throw new Error("Failed to fetch clusters");
        }
    }

    // Get Single Cluster
    async getCluster(projectId, clusterName) {
        try {
            return await this.request('GET', `/groups/${projectId}/clusters/${clusterName}`);
        } catch (error) {
            console.error(`Atlas getCluster Error for ${clusterName}:`, error.response?.data || error.message);
            throw new Error(`Failed to fetch cluster ${clusterName}`);
        }
    }

    // Delete Cluster
    async deleteCluster(projectId, clusterName) {
        try {
            await this.request('DELETE', `/groups/${projectId}/clusters/${clusterName}`);
        } catch (error) {
            if (error.response && error.response.data && error.response.data.errorCode === 'CLUSTER_ALREADY_REQUESTED_DELETION') {
                return; // Already deleting, ignore
            }
            console.error("Atlas deleteCluster Error:", error.response?.data || error.message);
            throw new Error(`Failed to delete cluster ${clusterName}`);
        }
    }

    // Delete Project (Cleanup)
    async deleteProject(projectId) {
        try {
            // Fetch and delete all active clusters before deleting the project
            const clustersResponse = await this.getClusters(projectId);
            const clusters = clustersResponse.results || [];

            if (clusters.length > 0) {
                for (const cluster of clusters) {
                    try {
                        await this.deleteCluster(projectId, cluster.name);
                        console.log(`Successfully initiated deletion for cluster: ${cluster.name}`);
                    } catch (clusterDelErr) {
                        console.error(`Error deleting cluster ${cluster.name}:`, clusterDelErr.message);
                    }
                }
                throw new Error("Clusters are being terminated. Please wait a few minutes and try deleting the tenant again.");
            }

            await this.request('DELETE', `/groups/${projectId}`);
        } catch (err) {
            if (err.response && err.response.status === 404) {
                console.log(`Project ${projectId} already deleted in Atlas, ignoring...`);
                return; // Suppress 404 error if project is already deleted
            }
            console.error("Atlas deleteProject Error:", err.response?.data || err.message);
            throw new Error(err.message === "Clusters are being terminated. Please wait a few minutes and try deleting the tenant again." ? err.message : "Failed to delete project");
        }
    }

    // Create Cluster (Necessary to get database connection string)
    async createCluster(projectId, clusterName) {
        try {
            return await this.request('POST', `/groups/${projectId}/clusters`, {
                name: clusterName,
                providerSettings: {
                    providerName: "TENANT",
                    backingProviderName: "AWS",
                    instanceSizeName: "M0", // M0 free tier for example, or dynamic
                    regionName: "US_EAST_1"
                }
            });
        } catch (error) {
            console.error("Atlas createCluster Error:", error.response?.data || error.message);
            throw new Error("Atlas cluster creation failed.");
        }
    }
}

module.exports = new AtlasApiService();
