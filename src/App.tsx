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
  Modal
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
  generationDetails?: {
    prompt: string;
    duration: number;
    resolution: string;
    createdAt: string;
  };
}

// SORA supported video resolutions and formats
const supportedResolutions = [
  { value: '480x480', label: '480x480 (1:1)' },
  { value: '480x854', label: '480x854 (9:16 Portrait)' },
  { value: '854x480', label: '854x480 (16:9)' },
  { value: '720x720', label: '720x720 (1:1)' },
  { value: '1080x1080', label: '1080x1080 (1:1 Square)' },
  { value: '1080x1920', label: '1080x1920 (9:16 Portrait)' },
  { value: '1920x1080', label: '1920x1080 (16:9)' },
];

// SORA video duration limits (in seconds)
const MIN_VIDEO_DURATION = 1;
const MAX_VIDEO_DURATION = 10;

interface FormValues {
  prompt: string;
  duration: number;
  resolution: string;
}

function App() {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusEmoji, setStatusEmoji] = useState('⏳');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [openAiStatus, setOpenAiStatus] = useState<string>('');
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
    },
  });

  const getVideoFilename = (promptText: string): string => {
    // Get first two words from prompt, or default to 'video'
    const words = promptText.trim().split(/\s+/).filter(Boolean);
    const name = words.length > 0 
      ? words.slice(0, 2).join('_').toLowerCase()
      : 'video';
      
    // Remove any invalid filename characters
    const safeName = name.replace(/[^a-z0-9_]/gi, '_');
    return `${safeName}.mp4`;
  };

  const startJobPolling = (jobId: string) => {
    // Clear any existing interval
    if (pollingInterval.current !== null) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }

    const poll = async () => {
      try {
        console.log(`Polling job status for ID: ${jobId}`);
        const response = await apiClient.get(`/api/job/${jobId}`, {
          // Ensure we get the raw response for debugging
          transformResponse: [(data) => data]
        });

        // Manually parse the response
        let responseData;
        try {
          responseData = JSON.parse(response.data);
        } catch (e) {
          console.error('Failed to parse response data:', response.data);
          throw new Error('Invalid response format from server');
        }

        console.log('Poll response:', responseData);

        const { status, result, error, progress, openai_status, openai_response } = responseData;
        
        // Update status message based on OpenAI status
        if (openai_status) {
          setOpenAiStatus(`OpenAI Status: ${openai_status}`);
        }
        
        // Update job state with proper type safety
        setJob((prev: VideoJob | null) => {
          // Use the video_url from the result if available, otherwise construct it
          const videoUrl = result?.video_url 
            ? result.video_url
            : result?.video_id 
              ? `${window.location.origin}/api/v1/videos/${result.video_id}?t=${Date.now()}`
              : undefined;
            
          if (!prev) {
            return {
              id: jobId,
              status: status || 'pending',
              progress: progress || 0,
              error,
              openAiStatus: openai_status,
              openAiResponse: openai_response,
              videoUrl,
              generationDetails: {
                prompt: '',
                duration: 0,
                resolution: '',
                createdAt: new Date().toISOString()
              }
            };
          }
          
          return {
            ...prev,
            status: status || prev.status,
            progress: progress !== undefined ? progress : prev.progress,
            error: error || prev.error,
            openAiStatus: openai_status || prev.openAiStatus,
            openAiResponse: openai_response || prev.openAiResponse,
            videoUrl: videoUrl || prev.videoUrl
          };
        });

        if (status === 'completed') {
          console.log(`Job ${jobId} completed with status: ${status}`);
          if (pollingInterval.current !== null) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
          }
          setIsLoading(false);
          setStatusEmoji('✅');
          setOpenAiStatus('Video generation completed successfully!');
          setShowDownloadModal(true);
        } else if (status === 'failed') {
          console.log(`Job ${jobId} failed`);
          if (pollingInterval.current !== null) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
          }
          setIsLoading(false);
          setStatusEmoji('❌');
          const errorMsg = error || 'Video generation failed';
          setError(errorMsg);
          setOpenAiStatus(`Error: ${errorMsg}`);
        } else {
          const progressMsg = progress ? ` (${progress}%)` : '';
          console.log(`Job ${jobId} in progress, status: ${status}${progressMsg}`);
          setStatusEmoji('⚙️');
          setOpenAiStatus(openai_status || `Processing${progress ? ` - ${progress}%` : '...'}`);
        }
      } catch (error: any) {
        console.error('Error polling job status:', error);
        const errorMessage = error.message || 'Unknown error';
        const errorMsg = error.response?.data?.detail || errorMessage || 'Failed to check job status';
        setError(`Error: ${errorMsg}`);
        setStatusEmoji('❌');
        setOpenAiStatus('Failed to check job status');
        
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
        setIsLoading(false);
      }
    };

    // Initial poll
    poll();
    // Then poll every 2 seconds
    pollingInterval.current = setInterval(poll, 2000) as unknown as ReturnType<typeof setInterval>;
  };

  useEffect(() => {
    return () => {
      if (pollingInterval.current !== null) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, []);

  const handleGenerate = async (values: FormValues) => {
    try {
      setIsLoading(true);
      setError(null);
      setStatusEmoji('🔄');
      setOpenAiStatus('Sending request to OpenAI...');
      
      const [width, height] = values.resolution.split('x').map(Number);
      
      const response = await apiClient.post('/api/generate', {
        prompt: values.prompt,
        width,
        height,
        n_seconds: values.duration,
      });

      console.log('Generation response:', response.data);
      
      if (response.data && response.data.id) {
        const jobId = response.data.id;
        setJob({
          id: jobId,
          status: 'pending',
          progress: 0,
          generationDetails: {
            prompt: values.prompt,
            duration: values.duration,
            resolution: values.resolution,
            createdAt: new Date().toISOString()
          }
        });
        setOpenAiStatus('Request received. Processing video generation...');
        startJobPolling(jobId);
      } else {
        throw new Error('No job ID received in response');
      }
    } catch (err: any) {
      console.error('Error generating video:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to start video generation';
      setError(`Error: ${errorMsg}`);
      setIsLoading(false);
      setStatusEmoji('❌');
    }
  };

  const handleDownload = async (videoUrl: string, filename: string) => {
    try {
      setIsSaving(true);
      setError(null);
      
      console.log('Starting download from URL:', videoUrl);
      
      // Add cache busting parameter
      const url = new URL(videoUrl);
      url.searchParams.set('t', Date.now().toString());
      
      // Create a direct link to the video file
      const a = document.createElement('a');
      a.href = url.toString();
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      
      // Append to body (required for some browsers)
      document.body.appendChild(a);
      
      // Trigger the download
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        
        // Show a message if the download doesn't start automatically
        const timer = setTimeout(() => {
          setError('Download did not start automatically. Right-click the video and select "Save video as..."');
        }, 2000);
        
        return () => clearTimeout(timer);
      }, 100);
      
      console.log('Download initiated for:', filename);
      return true;
      
    } catch (error) {
      console.error('Error initiating download:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to start download: ${errorMessage}\nYou can right-click the video and select "Save video as..."`);
      return false;
    } finally {
      // Don't close the modal immediately to show any error messages
      setTimeout(() => {
        setIsSaving(false);
      }, 1000);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Title order={1} mb="xl" style={{ textAlign: 'center' }}>
        Video Generation Demo
      </Title>
      
      <Paper withBorder p="xl" radius="md" style={{ position: 'relative' }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            borderRadius: '8px'
          }}>
            <Text size="sm" mb="md">{openAiStatus || 'Processing...'}</Text>
            <Progress value={job?.progress || 0} style={{ width: '80%' }} />
          </div>
        )}
        <form onSubmit={form.onSubmit(handleGenerate)}>
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
              data={supportedResolutions.map((res) => ({
                value: res.value,
                label: res.label
              }))}
              value={form.values.resolution}
              onChange={(value) => {
                if (value) {
                  form.setFieldValue('resolution', value);
                }
              }}
              disabled={isLoading}
              required
            />
            
            <NumberInput
              label="Duration (seconds)"
              description="Video duration in seconds (1-60)"
              min={1}
              max={60}
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
              >
                Generate Video
              </Button>
              
              {job?.status === 'completed' && job.videoUrl && (
                <Button
                  leftSection={<IconDownload size={16} />}
                  onClick={() => handleDownload(job.videoUrl!, getVideoFilename(form.values.prompt))}
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
                </Text>
                {job.progress !== undefined && (
                  <Progress value={job.progress || 0} size="sm" mt="sm" />
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
          
          <Group justify="center" mt="md">
            <Button
              variant="filled"
              color="blue"
              size="md"
              leftSection={<IconDownload size={18} />}
              onClick={() => job?.videoUrl && handleDownload(job.videoUrl, getVideoFilename(form.values.prompt))}
              loading={isSaving}
              disabled={isSaving}
            >
              {isSaving ? 'Starting Download...' : 'Download Video'}
            </Button>
            
            {!isSaving && (
              <Button
                variant="outline"
                onClick={() => setShowDownloadModal(false)}
              >
                Close
              </Button>
            )}
          </Group>
          
          {error && (
            <Alert color="red" mt="md">
              <Text size="sm">{error}</Text>
            </Alert>
          )}
        </Stack>
      </Modal>
    </Container>
  );
}

export default App;
