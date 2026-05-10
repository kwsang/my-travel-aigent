# 1. Define the long running function
def ask_for_approval(
    purpose: str, amount: float
) -> dict[str, Any]:
    """Ask for approval for the reimbursement."""
    # create a ticket for the approval
    # Send a notification to the approver with the link of the ticket
    return {'status': 'pending', 'approver': 'Sean Zhou', 'purpose' : purpose, 'amount': amount, 'ticket-id': 'approval-ticket-1'}

def reimburse(purpose: str, amount: float) -> str:
    """Reimburse the amount of money to the employee."""
    # send the reimbrusement request to payment vendor
    return {'status': 'ok'}

# 2. Wrap the function with LongRunningFunctionTool
long_running_tool = LongRunningFunctionTool(func=ask_for_approval)