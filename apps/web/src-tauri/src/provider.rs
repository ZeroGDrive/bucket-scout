use serde::{Deserialize, Serialize};

/// Supported cloud storage provider types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    /// Cloudflare R2 - S3-compatible object storage
    #[default]
    CloudflareR2,
    /// Amazon Web Services S3
    AwsS3,
}

impl ProviderType {
    /// Returns whether this provider requires path-style URLs
    /// R2 requires path-style, AWS S3 uses virtual-hosted style by default
    pub fn force_path_style(&self) -> bool {
        match self {
            ProviderType::CloudflareR2 => true,
            ProviderType::AwsS3 => false,
        }
    }

    /// Returns the default region for this provider
    pub fn default_region(&self) -> &'static str {
        match self {
            ProviderType::CloudflareR2 => "auto",
            ProviderType::AwsS3 => "us-east-1",
        }
    }

    /// Returns display name for the provider
    pub fn display_name(&self) -> &'static str {
        match self {
            ProviderType::CloudflareR2 => "Cloudflare R2",
            ProviderType::AwsS3 => "Amazon S3",
        }
    }
}

/// R2 location hints for bucket creation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum R2LocationHint {
    /// Western North America
    Wnam,
    /// Eastern North America
    Enam,
    /// Western Europe
    Weur,
    /// Eastern Europe
    Eeur,
    /// Asia-Pacific
    Apac,
}

impl R2LocationHint {
    pub fn as_str(&self) -> &'static str {
        match self {
            R2LocationHint::Wnam => "wnam",
            R2LocationHint::Enam => "enam",
            R2LocationHint::Weur => "weur",
            R2LocationHint::Eeur => "eeur",
            R2LocationHint::Apac => "apac",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            R2LocationHint::Wnam => "Western North America",
            R2LocationHint::Enam => "Eastern North America",
            R2LocationHint::Weur => "Western Europe",
            R2LocationHint::Eeur => "Eastern Europe",
            R2LocationHint::Apac => "Asia-Pacific",
        }
    }
}

/// Common AWS S3 regions
pub const AWS_REGIONS: &[(&str, &str)] = &[
    ("us-east-1", "US East (N. Virginia)"),
    ("us-east-2", "US East (Ohio)"),
    ("us-west-1", "US West (N. California)"),
    ("us-west-2", "US West (Oregon)"),
    ("eu-west-1", "Europe (Ireland)"),
    ("eu-west-2", "Europe (London)"),
    ("eu-west-3", "Europe (Paris)"),
    ("eu-central-1", "Europe (Frankfurt)"),
    ("eu-north-1", "Europe (Stockholm)"),
    ("ap-northeast-1", "Asia Pacific (Tokyo)"),
    ("ap-northeast-2", "Asia Pacific (Seoul)"),
    ("ap-northeast-3", "Asia Pacific (Osaka)"),
    ("ap-southeast-1", "Asia Pacific (Singapore)"),
    ("ap-southeast-2", "Asia Pacific (Sydney)"),
    ("ap-south-1", "Asia Pacific (Mumbai)"),
    ("sa-east-1", "South America (São Paulo)"),
    ("ca-central-1", "Canada (Central)"),
    ("me-south-1", "Middle East (Bahrain)"),
    ("af-south-1", "Africa (Cape Town)"),
];
