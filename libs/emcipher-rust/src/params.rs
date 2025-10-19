/// Tunable Argon2id parameters (in KiB for memory).
/// Choose device-appropriate profiles at runtime (desktop vs mobile).
#[derive(Clone, Copy, Debug)]
pub struct KdfParams {
    pub m_cost_kib: u32, // memory, e.g. 262_144 = 256 MiB
    pub t_cost: u32,     // iterations
    pub p_cost: u32,     // parallelism
}

impl KdfParams {
    /// Aggressive desktop profile (fast CPUs, plenty RAM).
    pub const DESKTOP_STRONG: KdfParams = KdfParams {
        m_cost_kib: 262_144, // 256 MiB
        t_cost: 3,
        p_cost: 1,
    };
    /// Mobile-friendly strong (reduce memory, keep t_cost).
    pub const MOBILE_STRONG: KdfParams = KdfParams {
        m_cost_kib: 65_536, // 64 MiB
        t_cost: 4,
        p_cost: 1,
    };
    /// Low-power fallback (only if necessary).
    pub const LOW_POWER: KdfParams = KdfParams {
        m_cost_kib: 32_768, // 32 MiB
        t_cost: 4,
        p_cost: 1,
    };
}
