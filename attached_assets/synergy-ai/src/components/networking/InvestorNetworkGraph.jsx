import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Building2, Target, Users, Filter, Zap, Sparkles } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function GlassSelectTrigger({ className, ...props }) {
  return (
    <SelectTrigger
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "shadow-lg focus:ring-0",
        className
      )}
      {...props}
    />
  );
}

export default function InvestorNetworkGraph({ 
  startups = [], 
  matches = [], 
  firms = [], 
  contacts = [],
  outreaches = []
}) {
  const canvasRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filters, setFilters] = useState({
    firmType: 'all',
    stage: 'all',
    focus: 'all',
    minScore: 50
  });

  const { nodes, edges, focusAreas } = useMemo(() => {
    const nodeMap = new Map();
    const edgeList = [];
    const focusSet = new Set();

    // Add startup nodes
    startups.forEach(startup => {
      nodeMap.set(`startup-${startup.id}`, {
        id: `startup-${startup.id}`,
        type: 'startup',
        label: startup.company_name,
        data: startup,
        size: 35,
        color: '#7c3aed',
      });
    });

    // Add firm nodes with filtering
    firms.forEach(firm => {
      if (filters.firmType !== 'all' && firm.firm_type !== filters.firmType) return;
      if (filters.stage !== 'all' && !firm.investment_stages?.includes(filters.stage)) return;
      
      firm.investment_focus?.forEach(f => focusSet.add(f));
      
      if (filters.focus !== 'all' && !firm.investment_focus?.includes(filters.focus)) return;

      const matchScore = matches.find(m => m.firm_id === firm.id)?.match_score || 0;
      const hasOutreach = outreaches.some(o => o.firm_id === firm.id);
      
      if (matchScore < filters.minScore) return;

      nodeMap.set(`firm-${firm.id}`, {
        id: `firm-${firm.id}`,
        type: 'firm',
        label: firm.company_name,
        data: firm,
        matchScore,
        hasOutreach,
        size: 20 + (matchScore / 100) * 20,
        color: matchScore >= 80 ? '#22c55e' : matchScore >= 60 ? '#facc15' : '#3b82f6',
      });
    });

    // Add contact nodes
    contacts.forEach(contact => {
      if (!nodeMap.has(`firm-${contact.firm_id}`)) return;
      
      nodeMap.set(`contact-${contact.id}`, {
        id: `contact-${contact.id}`,
        type: 'contact',
        label: contact.full_name,
        data: contact,
        firmId: contact.firm_id,
        size: 12,
        color: '#ec4899',
      });

      edgeList.push({
        from: `contact-${contact.id}`,
        to: `firm-${contact.firm_id}`,
        type: 'works_at'
      });
    });

    // Add match edges
    matches.forEach(match => {
      if (!nodeMap.has(`startup-${match.startup_id}`) || !nodeMap.has(`firm-${match.firm_id}`)) return;
      
      edgeList.push({
        from: `startup-${match.startup_id}`,
        to: `firm-${match.firm_id}`,
        type: 'match',
        score: match.match_score,
        status: match.status
      });
    });

    // Add outreach edges
    outreaches.forEach(outreach => {
      if (!nodeMap.has(`startup-${outreach.startup_id}`) || !nodeMap.has(`firm-${outreach.firm_id}`)) return;
      
      edgeList.push({
        from: `startup-${outreach.startup_id}`,
        to: `firm-${outreach.firm_id}`,
        type: 'outreach',
        stage: outreach.stage
      });
    });

    return { 
      nodes: Array.from(nodeMap.values()), 
      edges: edgeList,
      focusAreas: Array.from(focusSet).sort()
    };
  }, [startups, firms, contacts, matches, outreaches, filters]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Simple force-directed layout simulation
    const positions = new Map();
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.35;
      positions.set(node.id, {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      });
    });

    let animationFrame;
    let iteration = 0;
    const maxIterations = 300;

    const simulate = () => {
      if (iteration >= maxIterations) return;
      iteration++;

      // Apply forces
      nodes.forEach((node, i) => {
        const pos = positions.get(node.id);
        
        // Repulsion between nodes
        nodes.forEach((other, j) => {
          if (i === j) return;
          const otherPos = positions.get(other.id);
          const dx = pos.x - otherPos.x;
          const dy = pos.y - otherPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 2000 / (dist * dist);
          pos.vx += (dx / dist) * force;
          pos.vy += (dy / dist) * force;
        });

        // Attraction along edges
        edges.forEach(edge => {
          if (edge.from === node.id) {
            const targetPos = positions.get(edge.to);
            if (targetPos) {
              const dx = targetPos.x - pos.x;
              const dy = targetPos.y - pos.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = dist * 0.01;
              pos.vx += (dx / dist) * force;
              pos.vy += (dy / dist) * force;
            }
          }
          if (edge.to === node.id) {
            const sourcePos = positions.get(edge.from);
            if (sourcePos) {
              const dx = sourcePos.x - pos.x;
              const dy = sourcePos.y - pos.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = dist * 0.01;
              pos.vx += (dx / dist) * force;
              pos.vy += (dy / dist) * force;
            }
          }
        });

        // Center gravity
        const dx = width / 2 - pos.x;
        const dy = height / 2 - pos.y;
        pos.vx += dx * 0.005;
        pos.vy += dy * 0.005;

        // Apply velocity with damping
        pos.x += pos.vx;
        pos.y += pos.vy;
        pos.vx *= 0.85;
        pos.vy *= 0.85;

        // Boundary constraints
        const margin = 50;
        pos.x = Math.max(margin, Math.min(width - margin, pos.x));
        pos.y = Math.max(margin, Math.min(height - margin, pos.y));
      });

      draw();
      animationFrame = requestAnimationFrame(simulate);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw edges
      ctx.lineWidth = 1.5;
      edges.forEach(edge => {
        const fromPos = positions.get(edge.from);
        const toPos = positions.get(edge.to);
        if (!fromPos || !toPos) return;

        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);
        ctx.lineTo(toPos.x, toPos.y);
        
        if (edge.type === 'match') {
          ctx.strokeStyle = edge.score >= 80 ? 'rgba(34, 197, 94, 0.4)' : 
                          edge.score >= 60 ? 'rgba(250, 204, 21, 0.4)' : 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 2;
        } else if (edge.type === 'outreach') {
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 1;
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw nodes
      nodes.forEach(node => {
        const pos = positions.get(node.id);
        if (!pos) return;

        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;

        // Glow effect for highlighted nodes
        if (isHovered || isSelected || node.matchScore >= 80) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = node.color;
        } else {
          ctx.shadowBlur = 0;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, node.size, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // White border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = isHovered || isSelected ? 3 : 2;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Node icon/indicator
        if (node.type === 'startup') {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🚀', pos.x, pos.y);
        } else if (node.type === 'firm' && node.hasOutreach) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📧', pos.x, pos.y);
        }

        // Label
        if (isHovered || isSelected || node.type === 'startup' || node.matchScore >= 80) {
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(
            node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label,
            pos.x,
            pos.y + node.size + 8
          );
        }
      });
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let found = null;
      for (const node of nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= node.size) {
          found = node;
          break;
        }
      }

      setHoveredNode(found);
      canvas.style.cursor = found ? 'pointer' : 'default';
      draw();
    };

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const node of nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= node.size) {
          setSelectedNode(node);
          draw();
          return;
        }
      }
      
      setSelectedNode(null);
      draw();
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    simulate();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [nodes, edges, hoveredNode, selectedNode, filters]);

  const firmTypes = useMemo(() => 
    [...new Set(firms.map(f => f.firm_type).filter(Boolean))].sort(),
    [firms]
  );

  const stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];

  const stats = useMemo(() => {
    const highScoreMatches = matches.filter(m => m.match_score >= 80).length;
    const activeOutreaches = outreaches.filter(o => 
      ['pitch_sent', 'opened', 'replied', 'call_scheduled'].includes(o.stage)
    ).length;
    
    return {
      totalNodes: nodes.length,
      totalConnections: edges.length,
      highScoreMatches,
      activeOutreaches
    };
  }, [nodes, edges, matches, outreaches]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Select value={filters.firmType} onValueChange={(v) => setFilters(prev => ({ ...prev, firmType: v }))}>
          <GlassSelectTrigger>
            <SelectValue placeholder="All types" />
          </GlassSelectTrigger>
          <SelectContent className="rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl shadow-xl">
            <SelectItem value="all">All Types</SelectItem>
            {firmTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.stage} onValueChange={(v) => setFilters(prev => ({ ...prev, stage: v }))}>
          <GlassSelectTrigger>
            <SelectValue placeholder="All stages" />
          </GlassSelectTrigger>
          <SelectContent className="rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl shadow-xl">
            <SelectItem value="all">All Stages</SelectItem>
            {stages.map(stage => (
              <SelectItem key={stage} value={stage}>{stage}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.focus} onValueChange={(v) => setFilters(prev => ({ ...prev, focus: v }))}>
          <GlassSelectTrigger>
            <SelectValue placeholder="All focus areas" />
          </GlassSelectTrigger>
          <SelectContent className="rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl shadow-xl">
            <SelectItem value="all">All Focus Areas</SelectItem>
            {focusAreas.slice(0, 20).map(focus => (
              <SelectItem key={focus} value={focus}>{focus}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-medium text-slate-700">Min Score: {filters.minScore}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={filters.minScore}
            onChange={(e) => setFilters(prev => ({ ...prev, minScore: Number(e.target.value) }))}
            className="w-full h-2 rounded-lg"
          />
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-medium text-slate-600">Total Nodes</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalNodes}</div>
        </div>

        <div className="rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-slate-600">Connections</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalConnections}</div>
        </div>

        <div className="rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-slate-600">Top Matches</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.highScoreMatches}</div>
        </div>

        <div className="rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-pink-600" />
            <span className="text-xs font-medium text-slate-600">Active Outreach</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.activeOutreaches}</div>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="relative rounded-3xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl shadow-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-[600px] bg-gradient-to-br from-white/40 to-white/20"
        />

        {/* Legend */}
        <div className="absolute top-4 right-4 rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl p-4 shadow-lg space-y-2">
          <div className="text-xs font-semibold text-slate-800 mb-2">Legend</div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-purple-600 border-2 border-white" />
            <span className="text-xs text-slate-700">Your Startup</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
            <span className="text-xs text-slate-700">Top Match (80+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-500 border-2 border-white" />
            <span className="text-xs text-slate-700">Good Match (60+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
            <span className="text-xs text-slate-700">Investor</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-pink-500 border-2 border-white" />
            <span className="text-xs text-slate-700">Contact</span>
          </div>
        </div>

        {/* Node Detail Panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-80 rounded-2xl border-2 border-white/60 bg-white/90 backdrop-blur-2xl p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {selectedNode.type === 'startup' && <Building2 className="w-4 h-4 text-purple-600" />}
                  {selectedNode.type === 'firm' && <Target className="w-4 h-4 text-blue-600" />}
                  {selectedNode.type === 'contact' && <Users className="w-4 h-4 text-pink-600" />}
                  <Badge variant="secondary" className="text-xs">{selectedNode.type}</Badge>
                </div>
                <h4 className="font-bold text-slate-900">{selectedNode.label}</h4>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            {selectedNode.type === 'firm' && (
              <div className="space-y-2 text-sm">
                {selectedNode.matchScore > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Match Score</span>
                    <Badge className={cn(
                      "rounded-full",
                      selectedNode.matchScore >= 80 && "bg-green-100 text-green-700",
                      selectedNode.matchScore >= 60 && selectedNode.matchScore < 80 && "bg-yellow-100 text-yellow-700",
                      selectedNode.matchScore < 60 && "bg-blue-100 text-blue-700"
                    )}>
                      {selectedNode.matchScore}
                    </Badge>
                  </div>
                )}
                {selectedNode.data.firm_type && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Type</span>
                    <span className="font-medium text-slate-900">{selectedNode.data.firm_type}</span>
                  </div>
                )}
                {selectedNode.data.investment_focus?.length > 0 && (
                  <div>
                    <span className="text-slate-600">Focus</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.data.investment_focus.slice(0, 3).map((f, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.hasOutreach && (
                  <Badge className="bg-pink-100 text-pink-700 text-xs">
                    Active Outreach
                  </Badge>
                )}
              </div>
            )}

            {selectedNode.type === 'contact' && selectedNode.data && (
              <div className="space-y-2 text-sm">
                {selectedNode.data.title && (
                  <div>
                    <span className="text-slate-600">Title</span>
                    <p className="font-medium text-slate-900">{selectedNode.data.title}</p>
                  </div>
                )}
                {selectedNode.data.work_email && (
                  <div>
                    <span className="text-slate-600">Email</span>
                    <p className="text-xs text-indigo-600">{selectedNode.data.work_email}</p>
                  </div>
                )}
              </div>
            )}

            {selectedNode.type === 'startup' && selectedNode.data && (
              <div className="space-y-2 text-sm">
                {selectedNode.data.stage && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Stage</span>
                    <Badge variant="secondary">{selectedNode.data.stage}</Badge>
                  </div>
                )}
                {selectedNode.data.industry?.length > 0 && (
                  <div>
                    <span className="text-slate-600">Industry</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNode.data.industry.slice(0, 2).map((ind, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{ind}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-900">Network Visualization</p>
            <p className="text-xs text-slate-600 mt-1">
              Nodes represent startups (purple), investors (color-coded by match score), and contacts (pink). 
              Hover or click nodes for details. Filter to focus on specific types, stages, or focus areas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}