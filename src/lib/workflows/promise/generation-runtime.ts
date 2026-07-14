import { END, START, StateGraph } from "@langchain/langgraph";

import { WorkflowState, type PromiseWorkflowState } from "./generation-runtime-state";

type PromiseRuntimeNode = (
  state: PromiseWorkflowState,
) => Promise<Partial<PromiseWorkflowState> | Record<string, unknown>> |
  Partial<PromiseWorkflowState> |
  Record<string, unknown>;

type PromiseRuntimeNodes = {
  loadContextNode: PromiseRuntimeNode;
  appendUserMessageNode: PromiseRuntimeNode;
  generatePromiseReplyNode: PromiseRuntimeNode;
  extractPromiseNode: PromiseRuntimeNode;
  scorePromiseNode: PromiseRuntimeNode;
  personaNode: PromiseRuntimeNode;
  marketNode: PromiseRuntimeNode;
  recommendationsNode: PromiseRuntimeNode;
  persistNode: PromiseRuntimeNode;
};

export function createPromiseWorkflowRunner(nodes: PromiseRuntimeNodes) {
  const promiseGraph = new StateGraph(WorkflowState)
    .addNode("loadContext", nodes.loadContextNode)
    .addNode("appendUserMessage", nodes.appendUserMessageNode)
    .addNode("generatePromiseReply", nodes.generatePromiseReplyNode)
    .addNode("extractPromise", nodes.extractPromiseNode)
    .addNode("scorePromise", nodes.scorePromiseNode)
    .addNode("generatePersonas", nodes.personaNode)
    .addNode("generateMarket", nodes.marketNode)
    .addNode("generateRecommendations", nodes.recommendationsNode)
    .addNode("persistArtifacts", nodes.persistNode)
    .addEdge(START, "loadContext")
    .addEdge("loadContext", "appendUserMessage")
    .addEdge("appendUserMessage", "generatePromiseReply")
    .addEdge("generatePromiseReply", "extractPromise")
    // Every refine turn re-evaluates against the freshly extracted brief —
    // score, personas, and market are independent of each other; recommendations
    // needs personas and market to already be in state, so it runs last.
    .addEdge("extractPromise", "scorePromise")
    .addEdge("scorePromise", "generatePersonas")
    .addEdge("generatePersonas", "generateMarket")
    .addEdge("generateMarket", "generateRecommendations")
    .addEdge("generateRecommendations", "persistArtifacts")
    .addEdge("persistArtifacts", END)
    .compile();

  return async function runPromiseWorkflow(bookSlug: string, userInput: string) {
    return promiseGraph.invoke({
      bookSlug,
      userInput,
      bookSetupProfile: null,
      referenceMaterials: [],
      conversationMessages: [],
    });
  };
}
