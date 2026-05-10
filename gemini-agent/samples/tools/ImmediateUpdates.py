# Agent Interaction
async def call_agent_async(query):

    def get_long_running_function_call(event: Event) -> types.FunctionCall:
        # Get the long running function call from the event
        if not event.long_running_tool_ids or not event.content or not event.content.parts:
            return
        for part in event.content.parts:
            if (
                part
                and part.function_call
                and event.long_running_tool_ids
                and part.function_call.id in event.long_running_tool_ids
            ):
                return part.function_call

    def get_function_response(event: Event, function_call_id: str) -> types.FunctionResponse:
        # Get the function response for the fuction call with specified id.
        if not event.content or not event.content.parts:
            return
        for part in event.content.parts:
            if (
                part
                and part.function_response
                and part.function_response.id == function_call_id
            ):
                return part.function_response

    content = types.Content(role='user', parts=[types.Part(text=query)])
    session, runner = await setup_session_and_runner()

    print("\nRunning agent...")
    events_async = runner.run_async(
        session_id=session.id, user_id=USER_ID, new_message=content
    )


    long_running_function_call, long_running_function_response, ticket_id = None, None, None
    async for event in events_async:
        # Use helper to check for the specific auth request event
        if not long_running_function_call:
            long_running_function_call = get_long_running_function_call(event)
        else:
            _potential_response = get_function_response(event, long_running_function_call.id)
            if _potential_response: # Only update if we get a non-None response
                long_running_function_response = _potential_response
                ticket_id = long_running_function_response.response['ticket-id']
        if event.content and event.content.parts:
            if text := ''.join(part.text or '' for part in event.content.parts):
                print(f'[{event.author}]: {text}')


    if long_running_function_response:
        # query the status of the correpsonding ticket via tciket_id
        # send back an intermediate / final response
        updated_response = long_running_function_response.model_copy(deep=True)
        updated_response.response = {'status': 'approved'}
        async for event in runner.run_async(
          session_id=session.id, user_id=USER_ID, new_message=types.Content(parts=[types.Part(function_response = updated_response)], role='user')
        ):
            if event.content and event.content.parts:
                if text := ''.join(part.text or '' for part in event.content.parts):
                    print(f'[{event.author}]: {text}')