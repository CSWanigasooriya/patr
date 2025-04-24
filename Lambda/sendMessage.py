import boto3
import json
import os
import sys
import time # Import time module
import traceback

# --- Configuration from Environment Variables ---

# Knowledge Base ID (Required)
try:
    KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]
    if not KNOWLEDGE_BASE_ID: raise ValueError("Env var 'KNOWLEDGE_BASE_ID' is set but empty.")
    print(f"Using Knowledge Base ID: {KNOWLEDGE_BASE_ID}")
except KeyError:
    error_message = "CRITICAL ERROR: Required environment variable 'KNOWLEDGE_BASE_ID' is not set."
    print(error_message); raise ValueError(error_message)
except ValueError as e:
    error_message = f"CRITICAL ERROR: {e}."; print(error_message); raise ValueError(error_message) from e

# Foundation Model ARN for the Knowledge Base (Required)
try:
    MODEL_ARN = os.environ["MODEL_ARN"]
    if not MODEL_ARN: raise ValueError("Env var 'MODEL_ARN' is set but empty.")
    print(f"Using Model ARN for RAG: {MODEL_ARN}")
except KeyError:
    error_message = "CRITICAL ERROR: Required environment variable 'MODEL_ARN' is not set."
    print(error_message); raise ValueError(error_message)
except ValueError as e:
    error_message = f"CRITICAL ERROR: {e}."; print(error_message); raise ValueError(error_message) from e

# Chat History Table Name (Required for history)
try:
    CHAT_HISTORY_TABLE = os.environ["CHAT_HISTORY_TABLE"]
    if not CHAT_HISTORY_TABLE: raise ValueError("Env var 'CHAT_HISTORY_TABLE' is set but empty.")
    print(f"Using DynamoDB table for chat history: {CHAT_HISTORY_TABLE}")
except KeyError:
    error_message = "CRITICAL ERROR: Required environment variable 'CHAT_HISTORY_TABLE' is not set. Chat history cannot be saved."
    print(error_message)
    # Set table name to None so history saving will be skipped gracefully
    CHAT_HISTORY_TABLE = None
    # Optionally, raise ValueError(error_message) if history is absolutely mandatory

# --- Resource Initialization ---

# Bedrock Client
try:
    bedrock_client = boto3.client('bedrock-agent-runtime')
except Exception as e:
    print(f"ERROR: Failed to initialize Boto3 Bedrock Agent Runtime client: {e}")
    bedrock_client = None

# DynamoDB Client and Table Resource (only if table name is set)
dynamodb = None
chat_history_table = None
if CHAT_HISTORY_TABLE:
    try:
        dynamodb = boto3.resource('dynamodb')
        chat_history_table = dynamodb.Table(CHAT_HISTORY_TABLE)
        print(f"DynamoDB resource initialized for table: {CHAT_HISTORY_TABLE}")
    except Exception as e:
        print(f"ERROR: Failed to initialize DynamoDB resource/table '{CHAT_HISTORY_TABLE}': {e}")
        chat_history_table = None # Ensure it's None if init fails


# --- Helper Function for Storing Messages ---
def store_message(table_ref, chat_id, sender, message, request_id="N/A"):
    """Stores a message in the specified DynamoDB table."""
    if not table_ref:
        # This happens if CHAT_HISTORY_TABLE env var is missing or DynamoDB init failed
        print(f"WARN RequestId: {request_id}: Chat history table not configured or initialized. Skipping message storage.")
        return

    timestamp_ms = int(time.time() * 1000) # Use milliseconds since epoch for timestamp (Sort Key)
    # Optional: Set a TTL (Time To Live) attribute - example: expire after 7 days
    # Adjust the duration (in seconds) as needed (e.g., 30 days: 60*60*24*30)
    ttl_timestamp = int(time.time()) + (60*60*24*7)

    print(f"INFO RequestId: {request_id}: Attempting to store message for chatId '{chat_id}', sender '{sender}'")
    try:
        table_ref.put_item(
           Item={
                'chatId': chat_id,           # Partition Key
                'timestamp': timestamp_ms,     # Sort Key
                'sender': sender,            # "user" or "bot"
                'message': message,          # The message text
                'ttl': ttl_timestamp         # Optional: TTL attribute
            }
        )
        # Consider logging success without logging the full message unless debugging
        # print(f"DEBUG RequestId: {request_id}: Stored message with timestamp {timestamp_ms}")
    except Exception as e:
        print(f"ERROR RequestId: {request_id}: Could not store message in DynamoDB table {table_ref.name}: {e}")
        print(traceback.format_exc())
        # Usually, failure to store history shouldn't stop the main flow


# --- Main Lambda Handler ---
def lambda_handler(event, context):
    request_id = context.aws_request_id if context else 'N/A'
    print(f"START RequestId: {request_id}")
    print(f"Received Event: {json.dumps(event)}")

    if bedrock_client is None:
         print(f"CRITICAL RequestId: {request_id}: Bedrock client was not initialized.")
         return {'statusCode': 500, 'body': json.dumps('Server configuration error: Bedrock client not initialized.')}

    # Extract Connection ID and Message
    try:
        connection_id = event['requestContext']['connectionId']
        domain_name = event["requestContext"]["domainName"]
        stage = event["requestContext"]["stage"]
        user_message_body = event.get('body', '')
    except KeyError as e:
        print(f"ERROR RequestId: {request_id}: Missing required key in event.requestContext: {e}")
        return {'statusCode': 400, 'body': json.dumps(f'Bad request: Missing {e} in request context.')}

    # Parse User Message (Treat as query)
    user_query = ''
    # (Using the same robust parsing logic)
    if user_message_body:
        parsed_json = None
        is_json_object = False
        try:
            parsed_json = json.loads(user_message_body)
            if isinstance(parsed_json, dict):
                is_json_object = True
                user_query = parsed_json.get('message', parsed_json.get('query'))
        except json.JSONDecodeError:
            print(f"INFO RequestId: {request_id}: Body was not JSON, treating as plain text query.")
            pass
        if not user_query:
            user_query = user_message_body
            if is_json_object: print(f"INFO RequestId: {request_id}: Parsed JSON object but found no 'message' or 'query' key, using raw body string as query.")
            elif parsed_json is not None: print(f"INFO RequestId: {request_id}: Parsed JSON was not an object (type: {type(parsed_json)}), using raw body string as query.")

    if not user_query:
         print(f"WARN RequestId: {request_id}: Extracted query is empty after parsing.")
         # (Handle empty query as before)
         try:
            endpoint_url = f"https://{domain_name}/{stage}"
            api_gateway_client_for_error = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)
            api_gateway_client_for_error.post_to_connection(ConnectionId=connection_id, Data=json.dumps({"error": "Received empty or unusable query."}))
         except Exception as post_error:
             print(f"ERROR RequestId: {request_id}: Failed to send empty query error to client {connection_id}: {post_error}")
         return {'statusCode': 200, 'body': json.dumps('Empty query received.')}

    print(f"INFO RequestId: {request_id}: Received query for processing: '{user_query}'") # Log the final query string

    # --- Store User Message ---
    # Use connection_id as the chatId for this simple example
    store_message(chat_history_table, connection_id, "user", user_query, request_id)
    # --- End Store User Message ---

    print(f"INFO RequestId: {request_id}: Querying Knowledge Base ID: {KNOWLEDGE_BASE_ID}")
    print(f"INFO RequestId: {request_id}: Using Model ARN for generation: {MODEL_ARN}")

    # Initialize API Gateway Management Client
    try:
        endpoint_url = f"https://{domain_name}/{stage}"
        api_gateway_client = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)
    except Exception as e:
        print(f"ERROR RequestId: {request_id}: Failed to initialize API Gateway Management client: {e}")
        return {'statusCode': 500, 'body': json.dumps('Server configuration error: Cannot connect to API Gateway.')}

    # Call Bedrock RetrieveAndGenerate and Send Response
    ai_response_text = ""
    citations = []
    try:
        print(f"INFO RequestId: {request_id}: Querying Knowledge Base {KNOWLEDGE_BASE_ID} with model {MODEL_ARN}")
        response = bedrock_client.retrieve_and_generate(
            input={'text': user_query},
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': KNOWLEDGE_BASE_ID,
                    'modelArn': MODEL_ARN
                }
            }
        )
        print(f"INFO RequestId: {request_id}: Bedrock RAG Response received.")
        ai_response_text = response.get('output', {}).get('text', 'Sorry, I could not retrieve an answer from the knowledge base.')
        citations = response.get('citations', [])
        if citations: print(f"INFO RequestId: {request_id}: Retrieved {len(citations)} citations.")

        # --- Store Bot Response (Success Case) ---
        store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id)
        # --- End Store Bot Response ---

    # Exception Handling for Bedrock Call
    except bedrock_client.exceptions.ValidationException as e:
         print(f"ERROR RequestId: {request_id}: Bedrock Validation Exception during RetrieveAndGenerate: {e}")
         ai_response_text = f"Error processing request: Invalid input or configuration for Knowledge Base. Check Model ARN compatibility. Details: {e}"
         store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id) # Store error message
    except bedrock_client.exceptions.AccessDeniedException as e:
         print(f"ERROR RequestId: {request_id}: Bedrock Access Denied during RetrieveAndGenerate: {e}")
         ai_response_text = "Server error: Insufficient permissions to access Bedrock Knowledge Base resources."
         store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id) # Store error message
    except bedrock_client.exceptions.ResourceNotFoundException as e:
         print(f"ERROR RequestId: {request_id}: Bedrock Resource Not Found during RetrieveAndGenerate: {e}")
         ai_response_text = "Server error: Could not find the specified Knowledge Base or Model."
         store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id) # Store error message
    except bedrock_client.exceptions.ThrottlingException as e:
         print(f"ERROR RequestId: {request_id}: Bedrock Throttling Exception during RetrieveAndGenerate: {e}")
         ai_response_text = "Server busy. Please try again later."
         store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id) # Store error message
    except bedrock_client.exceptions.InternalServerException as e:
         print(f"ERROR RequestId: {request_id}: Bedrock Internal Server Exception during RetrieveAndGenerate: {e}")
         ai_response_text = "An internal server error occurred within Bedrock. Please try again later."
         store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id) # Store error message
    except Exception as e:
        print(f"ERROR RequestId: {request_id}: Unexpected error during Bedrock RetrieveAndGenerate or processing: {e}")
        print(traceback.format_exc())
        ai_response_text = "Sorry, an unexpected server error occurred while querying the knowledge base."
        store_message(chat_history_table, connection_id, "bot", ai_response_text, request_id) # Store error message

    # Send response back to the WebSocket client
    try:
        response_payload = {"response": ai_response_text}
        # Optional: Add processed citations here if needed
        print(f"INFO RequestId: {request_id}: Sending payload to connection {connection_id}")
        api_gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(response_payload)
        )
        print(f"INFO RequestId: {request_id}: Successfully sent response to connection {connection_id}")
    except api_gateway_client.exceptions.GoneException:
        print(f"WARN RequestId: {request_id}: Connection {connection_id} is gone. Cannot send message.")
    except api_gateway_client.exceptions.PayloadTooLargeException:
        print(f"ERROR RequestId: {request_id}: Response payload too large for WebSocket message limit (128KB). ConnectionId: {connection_id}")
        try:
             api_gateway_client.post_to_connection(ConnectionId=connection_id, Data=json.dumps({"error": "Response is too large to send."}))
        except Exception: pass
    except Exception as e:
        print(f"ERROR RequestId: {request_id}: Failed to send message to connection {connection_id}: {e}")
        print(traceback.format_exc())

    # Return Success
    print(f"END RequestId: {request_id}")
    return {'statusCode': 200, 'body': json.dumps('Message processed using Knowledge Base.')}