# KitAgent device protection

Device binding must be enforced by trusted backend code before an account receives trial access. Client-side identifiers are only signals and are not a security boundary.

Production enforcement should use authenticated server-side registration, an atomic device-binding claim, App Check/attestation where supported, and abuse/risk controls. VPN or proxy detection is supplemental and cannot by itself make browser registration unbreakable.
