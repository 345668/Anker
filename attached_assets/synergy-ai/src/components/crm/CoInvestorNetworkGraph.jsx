import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from 'lucide-react';

export default function CoInvestorNetworkGraph({ coInvestors, firmName }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !coInvestors?.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate positions for nodes
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;

    // Draw central node (main firm)
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', centerX, centerY + 4);

    // Draw co-investor nodes
    const maxConnections = Math.max(...coInvestors.map(c => c.co_investment_count));
    
    coInvestors.forEach((coInvestor, i) => {
      const angle = (i / coInvestors.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Draw connection line (thicker for more co-investments)
      const lineWidth = 1 + (coInvestor.co_investment_count / maxConnections) * 4;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Draw node
      const nodeSize = 15 + (coInvestor.co_investment_count / maxConnections) * 15;
      const nodeColor = coInvestor.co_investment_count >= 3 ? '#10b981' : 
                        coInvestor.co_investment_count >= 2 ? '#f59e0b' : '#94a3b8';
      
      ctx.fillStyle = nodeColor;
      ctx.beginPath();
      ctx.arc(x, y, nodeSize, 0, 2 * Math.PI);
      ctx.fill();

      // Draw count
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(coInvestor.co_investment_count.toString(), x, y + 3);
    });

  }, [coInvestors]);

  if (!coInvestors || coInvestors.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-600" />
          Co-Investor Network Map
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <canvas 
            ref={canvasRef} 
            width={600} 
            height={400}
            className="w-full border border-slate-200 rounded-lg bg-slate-50"
          />
        </div>
        
        {/* Legend */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {coInvestors.slice(0, 6).map((coInvestor, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded text-xs">
              <div className={`w-3 h-3 rounded-full ${
                coInvestor.co_investment_count >= 3 ? 'bg-emerald-500' :
                coInvestor.co_investment_count >= 2 ? 'bg-amber-500' :
                'bg-slate-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{coInvestor.firm_name}</p>
                <p className="text-slate-500">{coInvestor.co_investment_count} co-investments</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span>Frequent (3+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Moderate (2)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <span>Occasional (1)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}