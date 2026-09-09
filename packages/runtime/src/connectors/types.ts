export type ConnectorCategory = 'model' | 'mcp' | 'a2a' | 'cli' | 'browser' | 'desktop';
export type ConnectorPlatform = 'macos' | 'windows' | 'linux' | 'any';
export type ConnectorProvenance = 'first-party' | 'community';
export type ConnectorCompatibilityStatus = 'tested' | 'experimental' | 'unsupported';

export interface ConnectorRequirements {
  commands?: string[];
  environmentKeys?: string[];
}

export interface ConnectorProfile {
  kind: string;
  platform?: Exclude<ConnectorPlatform, 'any'>;
  template?: string;
}

export interface ConnectorCompatibility {
  status: ConnectorCompatibilityStatus;
  matrixId?: string;
  note?: string;
}

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  protocol: string;
  platforms: ConnectorPlatform[];
  requirements: ConnectorRequirements;
  profile: ConnectorProfile;
  compatibility: ConnectorCompatibility;
  provenance: ConnectorProvenance;
}

export interface ConnectorCatalogueDocument {
  version: '1.0.0';
  connectors: ConnectorDefinition[];
}

export type ConnectorCatalogueValidationResult =
  | { ok: true; value: ConnectorCatalogueDocument }
  | { ok: false; errors: string[] };
