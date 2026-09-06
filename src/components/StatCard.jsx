import React from 'react';
export default function StatCard({ label, value, detail }) { return <div className="stat"><span>{label}</span><b>{value}</b>{detail && <small>{detail}</small>}</div>; }
