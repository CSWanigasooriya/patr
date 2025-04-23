import os
import json
import boto3
import botocore # Import botocore for specific exception handling
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import logging # Use Flask's logger

# Load environment variables from .env file (if it exists)
load_dotenv()

# --- Flask App Initialization ---
app = Flask(__name__)
# Configure logging
app.logger.setLevel(logging.INFO) # Set default log level

# Enable CORS - REMEMBER to restrict origins in production!
# Example for production: origins=["https://your-angular-app-domain.com"]
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- AWS Bedrock Configuration ---
# Ensure you have AWS credentials configured (via aws configure, environment vars, or IAM role)
# and have requested access to the models/features in the Bedrock console.
aws_region = os.getenv("AWS_REGION", "us-east-1") # Default to us-east-1 if not set

# --- Boto3 Clients ---
try:
    # Client for direct model invocation (InvokeModel)
    bedrock_runtime = boto3.client(
        service_name='bedrock-runtime',
        region_name=aws_region
        # Boto3 will automatically look for credentials in the standard locations
    )
    app.logger.info(f"Bedrock Runtime client initialized for region {aws_region}")

    # Client for Knowledge Base interaction (RetrieveAndGenerate)
    bedrock_agent_runtime = boto3.client(
        service_name='bedrock-agent-runtime',
        region_name=aws_region
    )
    app.logger.info(f"Bedrock Agent Runtime client initialized for region {aws_region}")

except Exception as e:
    app.logger.error(f"Failed to initialize Boto3 clients: {e}")
    # Handle client initialization errors (e.g., credentials not found)
    # Depending on your deployment, you might want to exit or handle this differently
    bedrock_runtime = None
    bedrock_agent_runtime = None

# --- Model & Knowledge Base Configuration ---
# Direct Invocation Model ID (Choose one you have access to)
# Corrected example ID for Claude 3 Sonnet:
DIRECT_MODEL_ID = os.getenv("DIRECT_MODEL_ID", 'anthropic.claude-3-sonnet-20240229-v1:0')
# Example: Amazon Titan Text Lite
# DIRECT_MODEL_ID = 'amazon.titan-text-lite-v1'

# Knowledge Base Configuration (Set these in your .env file or environment)
KNOWLEDGE_BASE_ID = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID")
# ARN of the foundation model to use for generation within the Knowledge Base context
# Ensure this model is compatible with RetrieveAndGenerate and available in your region
KB_MODEL_ARN = os.getenv("BEDROCK_KB_MODEL_ARN", f'arn:aws:bedrock:{aws_region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0') # Example default

if not KNOWLEDGE_BASE_ID:
    app.logger.warning("BEDROCK_KNOWLEDGE_BASE_ID environment variable not set. Knowledge Base API will not work.")
if not KB_MODEL_ARN and KNOWLEDGE_BASE_ID:
     app.logger.warning("BEDROCK_KB_MODEL_ARN environment variable not set, using default. Knowledge Base API might fail if default is incorrect.")


# --- Bedrock Interaction Functions ---

def invoke_bedrock_model(prompt):
    """Sends a prompt directly to the configured Bedrock model (InvokeModel API)."""
    if not bedrock_runtime:
        app.logger.error("Bedrock Runtime client not initialized.")
        return "Error: Bedrock Runtime client not available."

    app.logger.info(f"Invoking direct model {DIRECT_MODEL_ID} for prompt: '{prompt[:50]}...'")
    try:
        # The payload structure depends HEAVILY on the model provider
        if "anthropic" in DIRECT_MODEL_ID:
            payload = {
                "anthropic_version": "bedrock-2023-05-31", # Required for Claude 3
                "max_tokens": 1024,
                "temperature": 0.7, # Example temperature
                "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
            }
            body = json.dumps(payload)
            response = bedrock_runtime.invoke_model(
                body=body,
                modelId=DIRECT_MODEL_ID,
                contentType='application/json',
                accept='application/json'
            )
            response_body = json.loads(response.get('body').read())
            # Extract text - structure varies between Anthropic models too
            ai_response = "".join([content.get('text', '') for content in response_body.get('content', [])])

        elif "amazon.titan" in DIRECT_MODEL_ID:
             payload = {
                 "inputText": prompt,
                 "textGenerationConfig": {
                     "maxTokenCount": 1024,
                     "temperature": 0.7,
                     "stopSequences": [],
                     "topP": 0.9
                 }
              }
             body = json.dumps(payload)
             response = bedrock_runtime.invoke_model(
                 body=body,
                 modelId=DIRECT_MODEL_ID,
                 contentType='application/json',
                 accept='application/json'
             )
             response_body = json.loads(response.get('body').read())
             # Titan Text response structure
             ai_response = response_body.get('results')[0].get('outputText')

        # Add more elif blocks here for other models (Cohere, AI21, Mistral, etc.)
        # consulting the AWS Bedrock documentation for their specific payload structures.

        else:
            app.logger.warning(f"Unsupported model configured for direct invocation: {DIRECT_MODEL_ID}")
            return f"Error: Unsupported model configured ({DIRECT_MODEL_ID})."

        app.logger.info(f"Direct invocation successful. Response: '{ai_response[:50]}...'")
        return ai_response

    except botocore.exceptions.ClientError as error:
        error_details = error.response.get("Error", {})
        error_code = error_details.get("Code")
        error_message = error_details.get("Message")
        app.logger.error(f"Boto3 ClientError invoking Bedrock (InvokeModel): {error_code} - {error_message}")
        if "AccessDeniedException" in str(error):
             return f"Access Denied to model {DIRECT_MODEL_ID}. Please check permissions."
        else:
             return f"Sorry, there was an AWS error: {error_code}"
    except Exception as e:
        app.logger.error(f"Unexpected error during direct Bedrock invocation: {e}")
        return f"Sorry, I encountered an unexpected error: {e}"

def retrieve_and_generate_from_kb(prompt, knowledge_base_id, model_arn):
    """Retrieves from the Knowledge Base and generates a response (RetrieveAndGenerate API)."""
    if not bedrock_agent_runtime:
        app.logger.error("Bedrock Agent Runtime client not initialized.")
        return {"error": "Bedrock Agent Runtime client not available."}

    if not knowledge_base_id or not model_arn:
         app.logger.error("Knowledge Base ID or Model ARN is missing.")
         return {"error": "Knowledge Base ID or Model ARN not configured correctly."}

    app.logger.info(f"Querying Knowledge Base {knowledge_base_id} with model {model_arn} for prompt: '{prompt[:50]}...'")
    try:
        response = bedrock_agent_runtime.retrieve_and_generate(
            input={
                'text': prompt
            },
            retrieveAndGenerateConfiguration={
                'type': 'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId': knowledge_base_id,
                    'modelArn': model_arn,
                    # --- Optional: Add configurations ---
                    # 'retrievalConfiguration': {
                    #     'vectorSearchConfiguration': { 'numberOfResults': 4 }
                    # },
                    # 'generationConfiguration': {
                    #      'inferenceConfig': { 'textInferenceConfig': { 'temperature': 0.0, 'maxTokens': 500 }}
                    # }
                }
            }
            # Optional: Manage session state
            # 'sessionId': 'your-session-id'
        )

        # --- Parse the Response ---
        generated_text = response['output']['text']
        citations = response.get('citations', [])
        session_id = response.get('sessionId')

        # Structure the response to include citations
        response_data = {
            "reply": generated_text,
            "citations": [],
            "session_id": session_id # Include session ID if you plan to use it
        }

        for citation in citations:
            retrieved_refs = citation.get('retrievedReferences', [])
            citation_data = {
                # "generated_response_part": citation.get('generatedResponsePart', {}).get('textResponsePart', {}).get('text'), # Can be verbose
                "references": []
            }
            for ref in retrieved_refs:
                 location_uri = None
                 location = ref.get('location')
                 if location:
                     if location.get('type') == 'S3':
                         location_uri = location.get('s3Location', {}).get('uri')
                     # Add elif for other location types if needed (WEB, CONFLUENCE etc.)

                 citation_data["references"].append({
                     "text": ref.get('content', {}).get('text'),
                     "location": location_uri
                 })
            if citation_data["references"]: # Only add if there are references
                response_data["citations"].append(citation_data)

        app.logger.info(f"Knowledge Base query successful. Response: '{generated_text[:50]}...'")
        return response_data # Return the structured dictionary

    except botocore.exceptions.ClientError as error:
        error_details = error.response.get("Error", {})
        error_code = error_details.get("Code")
        error_message = error_details.get("Message")
        app.logger.error(f"Boto3 ClientError during RetrieveAndGenerate: {error_code} - {error_message}")
        if "AccessDeniedException" in str(error):
             return {"error": f"Access Denied. Check permissions for RetrieveAndGenerate and access to KB '{knowledge_base_id}'."}
        elif "ResourceNotFoundException" in str(error):
             return {"error": f"Resource not found. Check KB ID '{knowledge_base_id}' or Model ARN '{model_arn}'."}
        else:
             return {"error": f"AWS Client Error: {error_code}"}
    except Exception as e:
        app.logger.error(f"Unexpected error during Knowledge Base query: {e}")
        return {"error": f"An internal server error occurred: {str(e)}"}


# --- API Endpoints ---

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Receives a message, sends it directly to the configured Bedrock model."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 415

    data = request.get_json()
    user_message = data.get('message')

    if not user_message:
        return jsonify({"error": "Missing 'message' in request body"}), 400

    app.logger.info(f"/api/chat received message: '{user_message[:50]}...'")

    # Send message directly to Bedrock model
    ai_reply = invoke_bedrock_model(user_message)

    app.logger.info(f"/api/chat sending reply: '{str(ai_reply)[:50]}...'") # Log reply start

    # Check if the reply indicates an error occurred internally
    if isinstance(ai_reply, str) and ai_reply.startswith("Error:") or ai_reply.startswith("Sorry,"):
         return jsonify({"error": ai_reply}), 500 # Return server error if function indicated failure

    return jsonify({"reply": ai_reply})


@app.route('/api/ask-kb', methods=['POST'])
def ask_kb_endpoint():
    """Receives a message, queries the configured Knowledge Base."""
    if not KNOWLEDGE_BASE_ID: # Check if KB is configured before proceeding
         return jsonify({"error": "Knowledge Base ID is not configured on the server."}), 501 # 501 Not Implemented

    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 415

    data = request.get_json()
    user_message = data.get('message')

    if not user_message:
        return jsonify({"error": "Missing 'message' in request body"}), 400

    app.logger.info(f"/api/ask-kb received message: '{user_message[:50]}...'")

    # Query the Knowledge Base
    kb_response = retrieve_and_generate_from_kb(user_message, KNOWLEDGE_BASE_ID, KB_MODEL_ARN)

    app.logger.info(f"/api/ask-kb sending response: {str(kb_response)[:100]}...") # Log response start

    # retrieve_and_generate_from_kb returns a dict. Check if it contains an 'error' key.
    if isinstance(kb_response, dict) and 'error' in kb_response:
        # Determine appropriate status code based on error if needed, default to 500
        status_code = 500
        if "Access Denied" in kb_response['error']:
             status_code = 403
        elif "Resource not found" in kb_response['error']:
             status_code = 404
        elif "not configured" in kb_response['error']:
            status_code = 501
        return jsonify(kb_response), status_code

    # If no error key, assume success and return the whole structured response
    return jsonify(kb_response)


# --- Health Check Endpoint ---
@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    # Could add checks for Boto3 client initialization here if needed
    return jsonify({"status": "ok", "message": "API is running"})


# --- Run the App ---
if __name__ == '__main__':
    # Set debug=False for production deployments
    # Use host='0.0.0.0' to allow connections from network (e.g., Docker container)
    app.run(host='0.0.0.0', port=5000, debug=True)