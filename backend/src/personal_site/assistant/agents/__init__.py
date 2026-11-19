"""Exécution LangChain typée des spécialistes, sans effets de bord métier."""

import json

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain_core.messages import HumanMessage

from personal_site.admin.llm import ProviderError
from personal_site.assistant.models import AGENT_RECURSION_LIMIT, MAX_INPUT
from personal_site.i18n import tr


async def invoke(model, schema, system, data, context, *, tools=None):
    encoded = json.dumps(data, ensure_ascii=False)
    if len(encoded) + len(system) > MAX_INPUT:
        raise ProviderError(tr("errors.contextLimit"), 422)
    agent = create_agent(
        model,
        tools=context.tools() if tools is None else tools,
        system_prompt=system,
        response_format=ToolStrategy(
            schema,
            handle_errors="Corrige la sortie pour respecter les types et champs du contrat.",
        ),
    )
    async with context.budget.semaphore:
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=encoded)]},
            {"recursion_limit": AGENT_RECURSION_LIMIT, "callbacks": []},
        )
    if "structured_response" not in result:
        raise ProviderError(tr("errors.modelTools"))
    return result["structured_response"]
