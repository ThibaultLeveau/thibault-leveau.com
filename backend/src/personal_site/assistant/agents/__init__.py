"""Exécution LangChain typée des spécialistes, sans effets de bord métier."""

import json

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain_core.messages import HumanMessage

from personal_site.admin.llm import ProviderError
from personal_site.assistant.models import MAX_INPUT


async def invoke(model, schema, system, data, context):
    encoded = json.dumps(data, ensure_ascii=False)
    if len(encoded) + len(system) > MAX_INPUT:
        raise ProviderError(
            "Le contexte dépasse la limite. Ciblez moins de fiches ou de champs.", 422
        )
    agent = create_agent(
        model,
        tools=context.tools(),
        system_prompt=system,
        response_format=ToolStrategy(
            schema,
            handle_errors="Corrige la sortie pour respecter les types et champs du contrat.",
        ),
    )
    async with context.budget.semaphore:
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=encoded)]},
            {"recursion_limit": 10, "callbacks": []},
        )
    if "structured_response" not in result:
        raise ProviderError(
            "Le modèle ne fournit pas de réponse structurée. "
            "Choisissez un modèle compatible avec les outils."
        )
    return result["structured_response"]
