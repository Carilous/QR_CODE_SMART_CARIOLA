import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const deviceColors = ['#236657', '#b86149', '#567e82', '#c8984d'];

function displayDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AnalyticsCharts({ scans, devices, total, documents }) {
  return (
    <>
      <div className="analytics-grid">
        <section className="analytics-panel scan-panel" aria-labelledby="scan-heading">
          <div className="analytics-panel-head"><div><span className="panel-kicker">VISITS OVER TIME</span><h2 id="scan-heading">Scan activity</h2></div><strong>{total} <small>visits</small></strong></div>
          {scans.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scans} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}><defs><linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#236657" stopOpacity={0.22} /><stop offset="100%" stopColor="#236657" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#eee6d9" vertical={false} /><XAxis dataKey="date" tickFormatter={displayDate} tick={{ fill: '#879189', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={24} /><YAxis allowDecimals={false} tick={{ fill: '#879189', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={displayDate} contentStyle={{ border: '1px solid #e6dece', borderRadius: 6, fontSize: 11 }} /><Area type="monotone" dataKey="scans" stroke="#236657" strokeWidth={2} fill="url(#scanFill)" /></AreaChart></ResponsiveContainer></div> : <p className="chart-empty">Scan activity will appear here when someone opens a QR link.</p>}
        </section>
        <section className="analytics-panel device-panel" aria-labelledby="device-heading">
          <div className="analytics-panel-head"><div><span className="panel-kicker">DEVICE MIX</span><h2 id="device-heading">Visitor devices</h2></div></div>
          {devices.length ? <div className="device-chart-layout"><div className="device-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={devices} dataKey="scans" nameKey="device" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">{devices.map((item, index) => <Cell key={item.device} fill={deviceColors[index % deviceColors.length]} />)}</Pie><Tooltip contentStyle={{ border: '1px solid #e6dece', borderRadius: 6, fontSize: 10 }} /></PieChart></ResponsiveContainer></div><div className="device-legend">{devices.map((item, index) => <div key={item.device}><i style={{ background: deviceColors[index % deviceColors.length] }} /><span>{item.device}</span><b>{item.scans}</b></div>)}</div></div> : <p className="chart-empty">Device breakdown appears after the first visit.</p>}
        </section>
      </div>
      <section className="analytics-panel popularity-panel" aria-labelledby="popular-heading">
        <div className="analytics-panel-head"><div><span className="panel-kicker">DOCUMENT ENGAGEMENT</span><h2 id="popular-heading">Most visited documents</h2></div><Link to="/documents">View library <ArrowRight size={14} /></Link></div>
        {documents.some((document) => document.scans > 0) ? <div className="popularity-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={documents.filter((document) => document.scans > 0).slice(0, 5)} margin={{ top: 8, right: 10, bottom: 0, left: 4 }}><CartesianGrid stroke="#eee6d9" horizontal={false} /><XAxis dataKey="title" tick={{ fill: '#77837a', fontSize: 9 }} axisLine={false} tickLine={false} interval={0} /><YAxis allowDecimals={false} tick={{ fill: '#879189', fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: '1px solid #e6dece', borderRadius: 6, fontSize: 10 }} /><Bar dataKey="scans" name="Visits" fill="#b86149" radius={[2, 2, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div> : <p className="chart-empty">No document visits recorded yet.</p>}
      </section>
    </>
  );
}