import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const stageLabels = {
  draft: 'Draft',
  pitch_sent: 'Sent',
  opened: 'Opened',
  clicked: 'Clicked',
  replied: 'Replied',
  call_scheduled: 'Call Set',
  in_negotiation: 'Negotiating',
  passed: 'Passed',
  funded: 'Funded',
};

export default function PipelineChart({ data = [] }) {
  const chartData = Object.entries(stageLabels).map(([key, label]) => ({
    name: label,
    count: data.filter(d => d.stage === key).length,
  })).filter(d => d.count > 0 || ['Sent', 'Opened', 'Replied', 'Call Set'].includes(d.name));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Outreach Pipeline</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis 
              type="category" 
              dataKey="name" 
              tick={{ fill: '#64748b', fontSize: 12 }} 
              width={80}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Bar 
              dataKey="count" 
              fill="#6366f1" 
              radius={[0, 4, 4, 0]}
              barSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}