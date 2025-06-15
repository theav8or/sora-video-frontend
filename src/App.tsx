import { useState, useRef, useEffect } from 'react';
import { 
  Container, 
  Title, 
  Textarea, 
  Button, 
  Paper, 
  Stack, 
  Group, 
  Select, 
  Text,
  NumberInput,
  Box,
  Progress,
  Alert,
  Modal,
  Overlay,
  Loader
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconRocket, IconDownload } from '@tabler/icons-react';
import apiClient from './api/client';
import '@mantine/core/styles.css';
import './App.css';

interface VideoJob {
  id: string;
  status: string;
  error?: string;
  videoUrl?: string;
  progress?: number;
  videoId?: string;
  openAiStatus?: string;
  openAiResponse?: any;
  result?: {
    video_id?: string;
    filename?: string;
    video_url?: string;
  };
  generationDetails?: {
    prompt: string;
    duration: number;
    resolution: string;
    createdAt: string;
  };
  prompt: string;
  duration: number;
  resolution: string;
  createdAt: string;
  [key: string]: any; // Allow additional properties
}

// SORA supported video resolutions and formats
const supportedResolutions = [
  { value: '480x480', label: '480x480 (1:1)' },
  { value: '480x854', label: '480x854 (9:16 Portrait)' },
  { value: '854x480', label: '854x480 (16:9)' },
  { value: '720x720', label: '720x720 (1:1)' },
  { value: '1080x1080', label: '1080x1080 (1:1 Square)' },
];

// SORA video duration limits (in seconds)
const MIN_VIDEO_DURATION = 1;
const MAX_VIDEO_DURATION = 10;

interface FormValues {
  prompt: string;
  duration: number;
  resolution: string;
}

// API client is now imported from './api/client'

function App() {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusEmoji, setStatusEmoji] = useState('⏳');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const form = useForm<FormValues>({
    initialValues: {
      prompt: '',
      duration: 5,
      resolution: '854x480',
    },
    validate: {
      prompt: (value) => (value.trim().length > 0 ? null : 'Prompt is required'),
      duration: (value) => 
        value >= MIN_VIDEO_DURATION && value <= MAX_VIDEO_DURATION 
          ? null 
          : `Duration must be between ${MIN_VIDEO_DURATION} and ${MAX_VIDEO_DURATION} seconds`,
      resolution: (value) => {
        const isValid = supportedResolutions.some(res => res.value === value);
        return isValid ? null : 'Please select a valid resolution';
      },
    },
  });

  const getVideoFilename = (promptText: string): string => {
    const words = promptText.trim().split(/\s+/).filter(Boolean);
    const name = words.length > 0 
      ? words.slice(0, 2).join('_').toLowerCase()
      : 'video';
    const safeName = name.replace(/[^a-z0-9_]/gi, '_');
    return `${safeName}.mp4`;
  };

  const startJobPolling = (jobId: string, initialJob: VideoJob) => {
    if (pollingInterval.current !== null) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }

    const initialJobWithDetails: VideoJob = {
      ...initialJob,
      id: jobId,
      status: 'pending',
      prompt: form.values.prompt,
      duration: form.values.duration,
      resolution: form.values.resolution,
      createdAt: new Date().toISOString(),
      progress: 0,
      generationDetails: {
        prompt: form.values.prompt,
        duration: form.values.duration,
        resolution: form.values.resolution,
        createdAt: new Date().toISOString()
      }
    };

    setJob(initialJobWithDetails);

    pollingInterval.current = setInterval(() => {
      checkJobStatus(jobId);
    }, 2000);
  };

  // Track retry attempts for each job
  const retryCount = useRef<Record<string, number>>({});
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000; // 2 seconds

  const checkJobStatus = async (jobId: string) => {
    try {
      const response = await apiClient.get(`/api/job/${jobId}`);
      const responseData = response.data;

      const { status, result, error, progress, openai_status, openai_response } = responseData;
      
      // Reset retry count on successful response
      retryCount.current[jobId] = 0;
      
      setJob((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: status || prev.status,
          progress: progress !== undefined ? progress : prev.progress,
          error: error || prev.error,
          openAiStatus: openai_status || prev.openAiStatus,
          openAiResponse: openai_response || prev.openAiResponse,
          result: result || prev.result,
          videoUrl: result?.video_url || prev.videoUrl
        };
      });

      if (status === 'completed') {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setIsLoading(false);
        setIsGenerating(false);
        setStatusEmoji('✅');
        setShowDownloadModal(true);
      } else if (status === 'failed') {
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setIsLoading(false);
        setIsGenerating(false);
        setStatusEmoji('❌');
        const errorMsg = error || 'Video generation failed';
        setError(errorMsg);
      } else {
        // Status updates are handled by the state updates
        setStatusEmoji('⚙️');
      }
    } catch (error: any) {
      // Handle 404 errors specifically
      if (error.response?.status === 404) {
        // Increment retry count
        retryCount.current[jobId] = (retryCount.current[jobId] || 0) + 1;
        
        // Only show error if we've exceeded max retries
        if (retryCount.current[jobId] >= MAX_RETRIES) {
          console.warn(`Job ${jobId} not found after ${MAX_RETRIES} attempts`);
          // Keep the job in processing state but update the status message
          setJob(prev => prev ? { 
            ...prev,
            status: 'processing',
            openAiStatus: 'Finalizing video... (this may take a few more moments)'
          } : null);
          
          // Continue polling with a longer delay
          if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = setInterval(() => checkJobStatus(jobId), 5000);
          }
        } else {
          // Schedule a retry with the same interval
          console.log(`Job ${jobId} not found, retrying (${retryCount.current[jobId]}/${MAX_RETRIES})...`);
          setTimeout(() => checkJobStatus(jobId), RETRY_DELAY);
        }
      } else {
        // Handle other errors
        console.error('Error polling job status:', error);
        setJob(prev => prev ? { 
          ...prev, 
          error: error.message || 'Failed to check job status' 
        } : null);
        pollingInterval.current = null;
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);

  const handleSubmit = async (values: FormValues) => {
    setIsLoading(true);
    setIsGenerating(true);
    setError(null);
    setStatusEmoji('🔄');
    
    const initialJob: VideoJob = {
      openAiStatus: 'Sending request to OpenAI...',
      id: '',
      status: 'pending',
      prompt: values.prompt,
      duration: values.duration,
      resolution: values.resolution,
      createdAt: new Date().toISOString(),
      progress: 0,
      generationDetails: {
        prompt: values.prompt,
        duration: values.duration,
        resolution: values.resolution,
        createdAt: new Date().toISOString()
      }
    };
    
    setJob(initialJob);

    try {
      const response = await apiClient.post('/api/generate', {
        prompt: values.prompt,
        width: parseInt(values.resolution.split('x')[0]),
        height: parseInt(values.resolution.split('x')[1]),
        n_seconds: values.duration,
      });

      if (response.data && response.data.id) {
        const jobWithStatus = {
          ...initialJob,
          openAiStatus: 'Request received. Processing video generation...'
        };
        startJobPolling(response.data.id, jobWithStatus);
      } else {
        throw new Error('No job ID received in response');
      }
    } catch (err: any) {
      console.error('Error generating video:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to start video generation';
      setError(errorMsg);
      setStatusEmoji('❌');
      setIsLoading(false);
      setJob(prev => prev ? { ...prev, openAiStatus: `Error: ${errorMsg}` } : null);
    }
  };

  const handleDownload = async (videoUrl: string, filename: string) => {
    try {
      setIsSaving(true);
      
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(videoUrl);
      document.body.removeChild(a);
      
      setIsSaving(false);
    } catch (err) {
      console.error('Error downloading video:', err);
      setError('Failed to download video. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <Container size="lg" py="xl" style={{ position: 'relative' }}>
      {/* Overlay that appears during video generation */}
      {(isLoading || isGenerating) && (
        <Overlay
          color="#000"
          backgroundOpacity={0.85}
          blur={3}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Loader size="xl" color="blue" mb="md" />
          <Title order={2} mb="md">Generating Your Video</Title>
          <Text size="lg" mb="md">This may take a few moments. Please don't close this page.</Text>
          
          {job?.openAiStatus && (
            <Text size="md" mb="md" style={{ maxWidth: '600px' }}>
              {job.openAiStatus}
            </Text>
          )}
          
          {job?.progress !== undefined && (
            <Box style={{ width: '100%', maxWidth: '400px' }}>
              <Box style={{ width: '100%' }}>
              <Text size="sm" ta="center" mb="xs">
                Progress: {Math.round(job.progress)}%
              </Text>
              <Progress
                value={job.progress}
                size="lg"
                radius="xl"
                mb="md"
                style={{ width: '100%' }}
              />
            </Box>
            </Box>
          )}
          
          <Button 
            variant="outline" 
            color="gray" 
            size="lg"
            disabled
            style={{ opacity: 0.7, cursor: 'not-allowed' }}
          >
            Please wait...
          </Button>
        </Overlay>
      )}
      
      <Title order={1} mb="xl" ta="center">
        Sora Video Generation
      </Title>
      
      <Paper withBorder p="md" radius="md" mb="xl">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Textarea
              label="Prompt"
              placeholder="Describe the video you want to generate..."
              required
              minRows={3}
              {...form.getInputProps('prompt')}
              disabled={isLoading}
            />
            
            <Select
              label="Resolution"
              description="Select a predefined resolution"
              data={supportedResolutions}
              {...form.getInputProps('resolution')}
              disabled={isLoading}
              required
            />
            
            <NumberInput
              label="Duration (seconds)"
              description={`Video duration in seconds (${MIN_VIDEO_DURATION}-${MAX_VIDEO_DURATION})`}
              min={MIN_VIDEO_DURATION}
              max={MAX_VIDEO_DURATION}
              {...form.getInputProps('duration')}
              disabled={isLoading}
              required
            />
            
            <Group>
              <Button 
                type="submit" 
                leftSection={<IconRocket size={16} />}
                loading={isLoading}
                disabled={isLoading}
                style={{ zIndex: isLoading ? 1001 : 'auto' }}
              >
                Generate Video
              </Button>
              
              {job?.status === 'completed' && job.result?.video_url && (
                <Button
                  leftSection={<IconDownload size={16} />}
                  onClick={() => handleDownload(job.result!.video_url!, getVideoFilename(form.values.prompt))}
                  loading={isSaving}
                  disabled={isSaving}
                >
                  Download Video
                </Button>
              )}
            </Group>
            
            {error && (
              <Alert color="red" mt="md">
                {error}
              </Alert>
            )}
            
            {job?.status && (
              <Box mt="md">
                <Text size="sm" mb="xs">
                  Status: {statusEmoji} {job.status}
                  {job.id && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Job ID: {job.id}
                    </Text>
                  )}
                  {job.result?.video_id && (
                    <Text size="xs" c="dimmed" mt={2}>
                      Sora ID: {job.result.video_id}
                    </Text>
                  )}
                </Text>
                {job.progress !== undefined && (
                  <Progress value={job.progress || 0} size="sm" mt="sm" />
                )}
                {job.openAiStatus && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {job.openAiStatus}
                  </Text>
                )}
              </Box>
            )}
          </Stack>
        </form>
      </Paper>

      <Modal
        opened={showDownloadModal}
        onClose={() => !isSaving && setShowDownloadModal(false)}
        title="🎥 Video Ready for Download"
        centered
        size="lg"
        closeOnClickOutside={!isSaving}
        withCloseButton={!isSaving}
      >
        <Stack gap="md">
          <Text size="sm">Your video has been generated successfully!</Text>
          
          {job?.openAiResponse && (
            <Paper p="md" withBorder>
              <Text size="sm" fw={500} mb="xs">Generation Details:</Text>
              <Text size="xs" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {JSON.stringify(job.openAiResponse, null, 2)}
              </Text>
            </Paper>
          )}
          
          <Text size="sm" fw={500}>
            File will be saved as: <Text span c="blue">{getVideoFilename(form.values.prompt)}</Text>
          </Text>
          
          <Group justify="flex-end" mt="md">
            <Button 
              variant="default" 
              onClick={() => setShowDownloadModal(false)}
              disabled={isSaving}
            >
              Close
            </Button>
            <Button 
              leftSection={<IconDownload size={16} />}
              onClick={() => {
                if (job?.result?.video_url) {
                  handleDownload(job.result.video_url, getVideoFilename(form.values.prompt));
                }
              }}
              loading={isSaving}
              disabled={isSaving || !job?.result?.video_url}
            >
              {isSaving ? 'Downloading...' : 'Download Video'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default App;