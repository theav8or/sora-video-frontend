import axios from 'axios';

// Get base URL from environment variables
const baseURL = import.meta.env.VITE_APP_URL || 'https://sora-wafl.azurewebsites.net';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL,
  withCredentials: false,  // Disable credentials for CORS
  timeout: 30000,  // 30 second timeout
});

console.log('API Client initialized with baseURL:', baseURL);

// Request interceptor to add headers
apiClient.interceptors.request.use(
  (config) => {
    // Add common headers for all requests
    config.headers['Content-Type'] = 'application/json';
    config.headers['Accept'] = 'application/json';
    
    // Add cache busting for GET requests
    if (config.method?.toLowerCase() === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }
    
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Handle response errors
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('Request setup error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
