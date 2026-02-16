import { useMemo, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  MarkerType,
  Node,
  OnConnect,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from "reactflow";
import "reactflow/dist/style.css";
import { getWorkflow, interpretText, saveWorkflow } from "./api";
import { InterpreterResult, WorkflowEdge, WorkflowNode } from "./types";

interface EditableNodeForm {
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  assignedPerson: string;
  status: WorkflowNode["status"];
  timeSpent: string;
  cost: string;
  notes: string;
  executedBy: string;
  estimatedEffort: string;
  realTimeSpent: string;
  valueContribution: string;
}

const toFlowNode = (node: WorkflowNode): Node<WorkflowNode> => ({
  id: node.id,
  data: node,
  position: node.position ?? { x: 120, y: 120 },
  type: "default"
});

const toFlowEdge = (edge: WorkflowEdge): Edge => ({
  ...edge,
  markerEnd: { type: MarkerType.ArrowClosed }
});

function toDomainNode(node: Node<WorkflowNode>): WorkflowNode {
  return {
    ...node.data,
    position: node.position
  };
}

function emptyNode(seed: number): WorkflowNode {
  return {
    id: `node-${seed}`,
    name: `Task ${seed}`,
    description: "",
    inputs: [],
    outputs: [],
    status: "pending",
    metrics: {
      timeSpent: 0,
      cost: 0,
      notes: ""
    },
    contribution: {}
  };
}

function WorkflowEditorInner() {
  const [workflowId, setWorkflowId] = useState<string>("");
  const [workflowName, setWorkflowName] = useState("New Workflow");
  const [chatInput, setChatInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [suggestionResult, setSuggestionResult] = useState<InterpreterResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const onConnect: OnConnect = (connection: Connection) => {
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
          markerEnd: { type: MarkerType.ArrowClosed }
        },
        current
      )
    );
  };

  function addManualNode() {
    const nextSeed = nodes.length + 1;
    const model = emptyNode(nextSeed);
    setNodes((current) => [
      ...current,
      {
        id: model.id,
        data: model,
        position: { x: 80 + nextSeed * 40, y: 120 + nextSeed * 20 },
        type: "default"
      }
    ]);
  }

  async function handleSave() {
    try {
      const saved = await saveWorkflow({
        id: workflowId || undefined,
        name: workflowName,
        nodes: nodes.map(toDomainNode),
        edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
      });

      setWorkflowId(saved.id);
      setStatusMessage(`Saved workflow ${saved.id} (version ${saved.versions.at(-1)?.version ?? 1})`);
    } catch (error) {
      setStatusMessage(`Save failed: ${(error as Error).message}`);
    }
  }

  async function handleLoad() {
    if (!workflowId) {
      setStatusMessage("Provide a workflow ID to load");
      return;
    }

    try {
      const workflow = await getWorkflow(workflowId);
      const latest = workflow.versions.at(-1);
      if (!latest) {
        setStatusMessage("Workflow has no versions");
        return;
      }

      setWorkflowName(workflow.name);
      setNodes(latest.nodes.map(toFlowNode));
      setEdges(latest.edges.map(toFlowEdge));
      setStatusMessage(`Loaded workflow ${workflow.id} v${latest.version}`);
    } catch (error) {
      setStatusMessage(`Load failed: ${(error as Error).message}`);
    }
  }

  async function handleInterpret() {
    if (!chatInput.trim()) return;

    try {
      const interpreted = await interpretText(chatInput.trim());
      setSuggestionResult(interpreted);
      setStatusMessage(`Detected ${interpreted.detectedTasks.length} tasks from chat`);
    } catch (error) {
      setStatusMessage(`Interpretation failed: ${(error as Error).message}`);
    }
  }

  function applySuggestions() {
    if (!suggestionResult) return;

    const nodeSuggestions = suggestionResult.suggestions.filter((item) => item.type === "node");
    const linkSuggestion = suggestionResult.suggestions.find((item) => item.type === "connections");

    const generatedNodes: Node<WorkflowNode>[] = [];
    const nameToId = new Map<string, string>();

    nodeSuggestions.forEach((item, index) => {
      const id = `chat-${Date.now()}-${index}`;
      nameToId.set(item.name, id);
      generatedNodes.push({
        id,
        position: { x: 120 + index * 220, y: 420 },
        data: {
          id,
          name: item.name,
          description: item.description,
          inputs: [],
          outputs: [],
          status: "pending",
          metrics: { timeSpent: 0, cost: 0, notes: "" },
          contribution: {}
        }
      });
    });

    const generatedEdges: Edge[] = [];
    if (linkSuggestion?.type === "connections") {
      linkSuggestion.links.forEach((link, index) => {
        const source = nameToId.get(link.sourceName);
        const target = nameToId.get(link.targetName);
        if (!source || !target) return;

        generatedEdges.push({
          id: `chat-edge-${Date.now()}-${index}`,
          source,
          target,
          markerEnd: { type: MarkerType.ArrowClosed }
        });
      });
    }

    setNodes((current) => [...current, ...generatedNodes]);
    setEdges((current) => [...current, ...generatedEdges]);
    setSuggestionResult(null);
    setStatusMessage("Suggestions applied to workflow");
  }

  function rejectSuggestions() {
    setSuggestionResult(null);
    setStatusMessage("Suggestions rejected");
  }

  const nodeForm: EditableNodeForm | null = selectedNode
    ? {
        name: selectedNode.data.name,
        description: selectedNode.data.description,
        inputs: selectedNode.data.inputs.join(", "),
        outputs: selectedNode.data.outputs.join(", "),
        assignedPerson: selectedNode.data.assignedPerson ?? "",
        status: selectedNode.data.status,
        timeSpent: String(selectedNode.data.metrics.timeSpent),
        cost: String(selectedNode.data.metrics.cost),
        notes: selectedNode.data.metrics.notes,
        executedBy: selectedNode.data.contribution?.executedBy ?? "",
        estimatedEffort: String(selectedNode.data.contribution?.estimatedEffort ?? 0),
        realTimeSpent: String(selectedNode.data.contribution?.realTimeSpent ?? 0),
        valueContribution: String(selectedNode.data.contribution?.valueContribution ?? 0)
      }
    : null;

  function updateSelectedNode(form: EditableNodeForm) {
    if (!selectedNodeId) return;

    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedNodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            name: form.name,
            description: form.description,
            inputs: form.inputs.split(",").map((value) => value.trim()).filter(Boolean),
            outputs: form.outputs.split(",").map((value) => value.trim()).filter(Boolean),
            assignedPerson: form.assignedPerson || undefined,
            status: form.status,
            metrics: {
              timeSpent: Number(form.timeSpent) || 0,
              cost: Number(form.cost) || 0,
              notes: form.notes
            },
            contribution: {
              executedBy: form.executedBy || undefined,
              estimatedEffort: Number(form.estimatedEffort) || 0,
              realTimeSpent: Number(form.realTimeSpent) || 0,
              valueContribution: Number(form.valueContribution) || 0
            }
          }
        };
      })
    );
  }

  return (
    <div className="workflow-shell">
      <section className="top-controls">
        <input value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} placeholder="Workflow name" />
        <input value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} placeholder="Workflow ID (for load/update)" />
        <button onClick={addManualNode}>Add Node</button>
        <button onClick={handleSave}>Save Workflow</button>
        <button onClick={handleLoad}>Load Workflow</button>
        <span className="status">{statusMessage}</span>
      </section>

      <main className="layout-grid">
        <section className="canvas-panel">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>

        <section className="sidebar">
          <div className="card">
            <h2>Chat Interpreter</h2>
            <textarea
              rows={4}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Describe your process. Example: Buy goods -> Clean/sort -> Sell -> Charge"
            />
            <button onClick={handleInterpret}>Interpret</button>

            {suggestionResult && (
              <div className="suggestions">
                <strong>Suggestions</strong>
                <ul>
                  {suggestionResult.detectedTasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <button onClick={applySuggestions}>Accept</button>
                  <button onClick={rejectSuggestions} className="secondary">
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Node Editor</h2>
            {!nodeForm && <p>Select a node in the diagram to edit it.</p>}
            {nodeForm && (
              <div className="form-grid">
                <label>
                  Name
                  <input value={nodeForm.name} onChange={(event) => updateSelectedNode({ ...nodeForm, name: event.target.value })} />
                </label>
                <label>
                  Description
                  <textarea
                    rows={2}
                    value={nodeForm.description}
                    onChange={(event) => updateSelectedNode({ ...nodeForm, description: event.target.value })}
                  />
                </label>
                <label>
                  Inputs (comma-separated)
                  <input value={nodeForm.inputs} onChange={(event) => updateSelectedNode({ ...nodeForm, inputs: event.target.value })} />
                </label>
                <label>
                  Outputs (comma-separated)
                  <input value={nodeForm.outputs} onChange={(event) => updateSelectedNode({ ...nodeForm, outputs: event.target.value })} />
                </label>
                <label>
                  Assigned Person
                  <input
                    value={nodeForm.assignedPerson}
                    onChange={(event) => updateSelectedNode({ ...nodeForm, assignedPerson: event.target.value })}
                  />
                </label>
                <label>
                  Status
                  <select value={nodeForm.status} onChange={(event) => updateSelectedNode({ ...nodeForm, status: event.target.value as any })}>
                    <option value="pending">pending</option>
                    <option value="active">active</option>
                    <option value="done">done</option>
                  </select>
                </label>
                <label>
                  Time Spent (min)
                  <input value={nodeForm.timeSpent} onChange={(event) => updateSelectedNode({ ...nodeForm, timeSpent: event.target.value })} />
                </label>
                <label>
                  Cost
                  <input value={nodeForm.cost} onChange={(event) => updateSelectedNode({ ...nodeForm, cost: event.target.value })} />
                </label>
                <label>
                  Notes
                  <input value={nodeForm.notes} onChange={(event) => updateSelectedNode({ ...nodeForm, notes: event.target.value })} />
                </label>
                <label>
                  Executed By
                  <input value={nodeForm.executedBy} onChange={(event) => updateSelectedNode({ ...nodeForm, executedBy: event.target.value })} />
                </label>
                <label>
                  Estimated Effort
                  <input
                    value={nodeForm.estimatedEffort}
                    onChange={(event) => updateSelectedNode({ ...nodeForm, estimatedEffort: event.target.value })}
                  />
                </label>
                <label>
                  Real Time Spent
                  <input
                    value={nodeForm.realTimeSpent}
                    onChange={(event) => updateSelectedNode({ ...nodeForm, realTimeSpent: event.target.value })}
                  />
                </label>
                <label>
                  Value Contribution
                  <input
                    value={nodeForm.valueContribution}
                    onChange={(event) => updateSelectedNode({ ...nodeForm, valueContribution: event.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner />
    </ReactFlowProvider>
  );
}
