using System.Management;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

static string? GetArg(string[] args, string name)
{
  for (var i = 0; i < args.Length; i++)
  {
    if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
    {
      return args[i + 1];
    }
  }
  return null;
}

static void PrintUsage()
{
  Console.WriteLine("Comptrol.Agent (heartbeat)");
  Console.WriteLine("Uso:");
  Console.WriteLine("  Comptrol.Agent.exe --api <http://host:3001/api/v1> --key <AGENT_API_KEY> --asset-tag <COD-PATRIMONIAL>");
}

static (string? ip, string? mac) GetPrimaryNetwork()
{
  foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
  {
    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
    if (ni.OperationalStatus != OperationalStatus.Up) continue;
    var ipProps = ni.GetIPProperties();
    var unicast = ipProps.UnicastAddresses.FirstOrDefault(u =>
      u.Address.AddressFamily == AddressFamily.InterNetwork &&
      !u.Address.ToString().StartsWith("169.254.") &&
      u.Address.ToString() != "127.0.0.1");
    if (unicast == null) continue;

    var mac = string.Join(":", ni.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2")));
    return (unicast.Address.ToString(), string.IsNullOrWhiteSpace(mac) ? null : mac);
  }

  return (null, null);
}

static string? TryGetBiosSerial()
{
  try
  {
    if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return null;
    using var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
    foreach (var obj in searcher.Get())
    {
      var serial = (obj["SerialNumber"] as string)?.Trim();
      if (!string.IsNullOrWhiteSpace(serial)) return serial;
    }
  }
  catch
  {
    // ignore
  }
  return null;
}

var api = GetArg(args, "--api");
var key = GetArg(args, "--key");
var assetTag = GetArg(args, "--asset-tag");

if (string.IsNullOrWhiteSpace(api) || string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(assetTag))
{
  PrintUsage();
  return 2;
}

api = api!.TrimEnd('/');
assetTag = assetTag!.Trim();

var (ip, mac) = GetPrimaryNetwork();
var payload = new
{
  assetTag,
  hostname = Environment.MachineName,
  ipAddress = ip,
  macAddress = mac,
  serialNumber = TryGetBiosSerial(),
  operatingSystem = RuntimeInformation.OSDescription,
  vendor = (string?)null,
  model = (string?)null
};

var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
using var req = new HttpRequestMessage(HttpMethod.Post, $"{api}/agent/heartbeat");
req.Headers.Add("x-agent-key", key);
req.Content = new StringContent(json, Encoding.UTF8, "application/json");

try
{
  using var res = await http.SendAsync(req);
  var body = await res.Content.ReadAsStringAsync();
  if (!res.IsSuccessStatusCode)
  {
    Console.Error.WriteLine($"ERROR HTTP {(int)res.StatusCode}: {body}");
    return 1;
  }
  Console.WriteLine(body);
  return 0;
}
catch (Exception ex)
{
  Console.Error.WriteLine($"ERROR: {ex.Message}");
  return 1;
}

