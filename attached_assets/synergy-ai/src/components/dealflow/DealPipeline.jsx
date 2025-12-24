import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building2, DollarSign, Calendar, TrendingUp, AlertCircle,
  FileText, Eye, MoreHorizontal
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STAGES = [
  { id: 'Initial Contact', label: 'Initial Contact', color: 'bg-slate-100' },
  { id: 'First Meeting', label: 'First Meeting', color: 'bg-blue-100' },
  { id: 'Due Diligence', label: 'Due Diligence', color: 'bg-purple-100' },
  { id: 'Term Sheet', label: 'Term Sheet', color: 'bg-indigo-100' },
  { id: 'Legal Review', label: 'Legal Review', color: 'bg-amber-100' },
  { id: 'Closing', label: 'Closing', color: 'bg-orange-100' },
  { id: 'Closed', label: 'Closed', color: 'bg-emerald-100' },
  { id: 'Passed', label: 'Passed', color: 'bg-red-100' }
];

const getClosingLikelihoodColor = (likelihood) => {
  if (!likelihood) return 'border-slate-200 bg-white';
  if (likelihood >= 80) return 'border-emerald-400 bg-emerald-50';
  if (likelihood >= 60) return 'border-blue-400 bg-blue-50';
  if (likelihood >= 40) return 'border-amber-400 bg-amber-50';
  return 'border-red-400 bg-red-50';
};

const getClosingLikelihoodBadge = (likelihood) => {
  if (!likelihood) return null;
  if (likelihood >= 80) return { label: 'High', className: 'bg-emerald-600 text-white' };
  if (likelihood >= 60) return { label: 'Good', className: 'bg-blue-600 text-white' };
  if (likelihood >= 40) return { label: 'Medium', className: 'bg-amber-600 text-white' };
  return { label: 'Low', className: 'bg-red-600 text-white' };
};

export default function DealPipeline({ deals, onViewDeal, onEditDeal, onDeleteDeal }) {
  const queryClient = useQueryClient();

  const updateStageMutation = useMutation({
    mutationFn: ({ dealId, newStage }) => 
      base44.entities.InvestmentDeal.update(dealId, { deal_stage: newStage }),
    onSuccess: () => {
      queryClient.invalidateQueries(['deals']);
      toast.success('Deal stage updated');
    },
  });

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const dealId = draggableId.replace('deal-', '');
    const newStage = destination.droppableId;

    updateStageMutation.mutate({ dealId, newStage });
  };

  const getDealsByStage = (stageId) => {
    return deals.filter(d => d.deal_stage === stageId);
  };

  const getTotalValueByStage = (stageId) => {
    const stageDeals = getDealsByStage(stageId);
    return stageDeals.reduce((sum, d) => sum + (d.expected_amount || 0), 0);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageDeals = getDealsByStage(stage.id);
          const totalValue = getTotalValueByStage(stage.id);

          return (
            <div key={stage.id} className="flex-shrink-0 w-80">
              <div className={cn("rounded-t-lg p-3 border-b-2", stage.color)}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-slate-900">{stage.label}</h3>
                  <Badge variant="secondary">{stageDeals.length}</Badge>
                </div>
                {totalValue > 0 && (
                  <p className="text-xs text-slate-600">
                    ${(totalValue / 1000000).toFixed(1)}M total
                  </p>
                )}
              </div>

              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "min-h-[500px] p-2 bg-slate-50 rounded-b-lg border-2 border-t-0",
                      snapshot.isDraggingOver ? "border-indigo-300 bg-indigo-50" : "border-slate-200"
                    )}
                  >
                    <div className="space-y-3">
                      {stageDeals.map((deal, index) => {
                        const closingLikelihood = deal.raw_data?.closing_prediction?.likelihood;
                        const likelihoodBadge = getClosingLikelihoodBadge(closingLikelihood);

                        return (
                          <Draggable 
                            key={deal.id} 
                            draggableId={`deal-${deal.id}`} 
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  "p-3 rounded-lg border-2 shadow-sm transition-all cursor-move",
                                  getClosingLikelihoodColor(closingLikelihood),
                                  snapshot.isDragging && "shadow-lg rotate-2"
                                )}
                              >
                                {/* Header */}
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-slate-900 text-sm line-clamp-1">
                                      {deal.deal_name}
                                    </h4>
                                    {deal.firm_name && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <Building2 className="w-3 h-3 text-slate-400" />
                                        <span className="text-xs text-slate-600 line-clamp-1">
                                          {deal.firm_name}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 ml-2"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => onViewDeal(deal)}>
                                        <Eye className="w-4 h-4 mr-2" />
                                        View Details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => onEditDeal(deal)}>
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => onDeleteDeal(deal.id)}
                                        className="text-red-600"
                                      >
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                {/* AI Closing Prediction */}
                                {closingLikelihood && (
                                  <div className="mb-2 p-2 bg-white/70 rounded border">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3 text-slate-500" />
                                        <span className="text-xs font-medium text-slate-700">
                                          AI Prediction
                                        </span>
                                      </div>
                                      {likelihoodBadge && (
                                        <Badge className={cn("text-xs", likelihoodBadge.className)}>
                                          {likelihoodBadge.label}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                                        <div 
                                          className={cn(
                                            "h-1.5 rounded-full transition-all",
                                            closingLikelihood >= 80 && "bg-emerald-600",
                                            closingLikelihood >= 60 && closingLikelihood < 80 && "bg-blue-600",
                                            closingLikelihood >= 40 && closingLikelihood < 60 && "bg-amber-600",
                                            closingLikelihood < 40 && "bg-red-600"
                                          )}
                                          style={{ width: `${closingLikelihood}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-semibold text-slate-900">
                                        {closingLikelihood}%
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Details */}
                                <div className="space-y-1">
                                  {deal.expected_amount && (
                                    <div className="flex items-center gap-1 text-xs">
                                      <DollarSign className="w-3 h-3 text-slate-400" />
                                      <span className="font-medium text-slate-900">
                                        ${(deal.expected_amount / 1000000).toFixed(1)}M
                                      </span>
                                    </div>
                                  )}
                                  {deal.expected_close_date && (
                                    <div className="flex items-center gap-1 text-xs text-slate-600">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(deal.expected_close_date).toLocaleDateString()}
                                    </div>
                                  )}
                                  {deal.status && (
                                    <Badge variant="outline" className="text-xs">
                                      {deal.status}
                                    </Badge>
                                  )}
                                </div>

                                {/* Risk Indicators */}
                                {deal.raw_data?.closing_prediction?.risk_factors?.length > 0 && (
                                  <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                                    <div className="flex items-center gap-1 mb-1">
                                      <AlertCircle className="w-3 h-3 text-amber-600" />
                                      <span className="text-xs font-medium text-amber-900">
                                        {deal.raw_data.closing_prediction.risk_factors.length} Risk(s)
                                      </span>
                                    </div>
                                    <p className="text-xs text-amber-800 line-clamp-1">
                                      {deal.raw_data.closing_prediction.risk_factors[0]}
                                    </p>
                                  </div>
                                )}

                                {/* Documents indicator */}
                                {deal.documents?.length > 0 && (
                                  <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                                    <FileText className="w-3 h-3" />
                                    {deal.documents.length} document(s)
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                    
                    {stageDeals.length === 0 && (
                      <div className="flex items-center justify-center h-32 text-slate-400">
                        <p className="text-sm">No deals</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}